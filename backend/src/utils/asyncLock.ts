/**
 * Per-key in-process mutex (promise chain).
 *
 * Bid submission uses this to serialize all bids for a single auction *before*
 * a database connection is acquired. Without it, a burst of concurrent bidders
 * on one hot auction would each open a transaction, grab a pooled connection,
 * and then block on the Postgres `SELECT ... FOR UPDATE` row lock — holding the
 * connection idle while they wait. A few dozen hot bidders would exhaust the
 * pool and every other request (across all auctions) would fail with a pool
 * timeout.
 *
 * With this lock, only one bid per auction is in-flight per server instance at
 * a time, so a hot auction consumes at most one connection. The DB row lock is
 * retained as the cross-instance correctness guarantee (multiple app instances
 * still serialize through Postgres).
 *
 * Waiters queue as chained promises (cheap, no DB resources) and are drained
 * FIFO. A per-key waiter counter removes the key once its queue empties, so
 * memory does not grow with the number of auctions seen over time.
 */
export class AsyncLock {
  private tails = new Map<string, Promise<void>>();
  private waiters = new Map<string, number>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });

    this.tails.set(key, current);
    this.waiters.set(key, (this.waiters.get(key) ?? 0) + 1);

    // Wait for everything queued before us to finish.
    await previous;
    try {
      return await fn();
    } finally {
      release();
      const remaining = (this.waiters.get(key) ?? 1) - 1;
      if (remaining <= 0) {
        this.waiters.delete(key);
        // Only clear the tail if no newer caller replaced it while we ran.
        if (this.tails.get(key) === current) {
          this.tails.delete(key);
        }
      } else {
        this.waiters.set(key, remaining);
      }
    }
  }
}
