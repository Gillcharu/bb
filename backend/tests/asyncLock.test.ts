import { AsyncLock } from '../src/utils/asyncLock';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('AsyncLock (per-auction bid serialization)', () => {
  it('runs same-key tasks strictly one at a time (no interleaving)', async () => {
    const lock = new AsyncLock();
    let active = 0;
    let maxConcurrent = 0;
    const order: number[] = [];

    const task = (n: number) =>
      lock.run('auction-1', async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        await delay(5);
        order.push(n);
        active -= 1;
      });

    await Promise.all([task(1), task(2), task(3), task(4), task(5)]);

    // Only one critical section ran at any moment...
    expect(maxConcurrent).toBe(1);
    // ...and they executed in submission (FIFO) order.
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('allows different keys to run concurrently', async () => {
    const lock = new AsyncLock();
    let active = 0;
    let maxConcurrent = 0;

    const task = (key: string) =>
      lock.run(key, async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        await delay(5);
        active -= 1;
      });

    await Promise.all([task('a'), task('b'), task('c')]);
    expect(maxConcurrent).toBe(3);
  });

  it('releases the lock even when a task throws, so the queue keeps draining', async () => {
    const lock = new AsyncLock();
    const results: string[] = [];

    const failing = lock
      .run('auction-1', async () => {
        throw new Error('boom');
      })
      .catch(() => results.push('failed'));

    const following = lock.run('auction-1', async () => {
      results.push('ran');
    });

    await Promise.all([failing, following]);
    // The key invariant: a throwing task must release the lock so the queued
    // task still runs (no deadlock). Exact interleaving of the two microtasks
    // is not guaranteed, so assert presence rather than order.
    expect(results).toContain('failed');
    expect(results).toContain('ran');
  });

  it('does not leak keys after the queue drains', async () => {
    const lock = new AsyncLock();
    await lock.run('auction-1', async () => {});
    await lock.run('auction-1', async () => {});
    // Give the microtask cleanup a tick to run.
    await delay(0);
    // @ts-expect-error - inspecting private state for the leak assertion
    expect(lock.tails.size).toBe(0);
    // @ts-expect-error - inspecting private state for the leak assertion
    expect(lock.waiters.size).toBe(0);
  });
});
