import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuctionState } from '@prisma/client';

interface SocketUser {
  id: string;
  email: string;
  role: 'SYSTEM_ADMIN' | 'AUCTION_OWNER' | 'APPROVER' | 'OBSERVER' | 'VENDOR';
  companyId: string;
  auctionId?: string;
  exp?: number;
}

export const setupSocketLiveEngine = (io: Server) => {
  // Enforce JWT token verification middleware for all Socket.IO connections
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      logger.warn(`Connection rejected: Unauthenticated socket handshake on ${socket.id}`);
      return next(new Error('Authentication error: JWT token is required'));
    }

    try {
      const decoded = jwt.verify(token, env.jwtSecret) as SocketUser;
      socket.data.user = decoded;
      return next();
    } catch (err) {
      logger.warn(`Connection rejected: Invalid or expired token socket handshake on ${socket.id}`);
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    logger.info(`Socket connected: ${socket.id} (User: ${user.email}, Role: ${user.role})`);

    // Mid-session expiry enforcement 1/2: force-disconnect the socket the moment
    // its JWT expires, so an expired session cannot keep receiving broadcasts.
    let expiryTimer: NodeJS.Timeout | undefined;
    if (user.exp) {
      const msUntilExpiry = user.exp * 1000 - Date.now();
      if (msUntilExpiry <= 0) {
        socket.disconnect(true);
        return;
      }
      expiryTimer = setTimeout(() => {
        logger.info(`Socket ${socket.id} disconnected: token expired mid-session (${user.email})`);
        socket.emit('session.expired', { reason: 'TOKEN_EXPIRED' });
        socket.disconnect(true);
      }, msUntilExpiry);
    }

    // Mid-session expiry enforcement 2/2: reject any event arriving after expiry
    // (covers clock drift and long-lived sockets without an exp claim).
    socket.use((_event, next) => {
      if (user.exp && user.exp * 1000 <= Date.now()) {
        socket.emit('session.expired', { reason: 'TOKEN_EXPIRED' });
        socket.disconnect(true);
        return;
      }
      next();
    });

    socket.on('join', async (data: { auctionId?: string }) => {
      try {
        const auctionId = data?.auctionId;
        if (!auctionId || typeof auctionId !== 'string') {
          socket.emit('join.rejected', { reason: 'INVALID_AUCTION' });
          return;
        }

        if (user.role === 'VENDOR') {
          // Vendors may only join the auction their session token is scoped to,
          // and must be an invited, unblocked participant.
          if (user.auctionId !== auctionId) {
            logger.warn(`Unauthorized join blocked: Vendor ${user.email} attempted auction ${auctionId}`);
            socket.emit('join.rejected', { reason: 'FORBIDDEN' });
            return;
          }
          const participant = await prisma.participant.findFirst({
            where: { auctionId, vendor: { email: user.email } },
            select: { blocked: true },
          });
          if (!participant) {
            logger.warn(`Unauthorized join blocked: ${user.email} is not a participant of auction ${auctionId}`);
            socket.emit('join.rejected', { reason: 'NOT_A_PARTICIPANT' });
            return;
          }
          await socket.join(`auction:${auctionId}`);
          await socket.join(`auction:${auctionId}:vendor:${user.id}`);
          socket.emit('join.accepted', { auctionId });
        } else if (['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER'].includes(user.role)) {
          // Staff may only observe auctions belonging to their own company.
          const auction = await prisma.auction.findUnique({
            where: { id: auctionId },
            select: { companyId: true },
          });
          if (!auction || (user.role !== 'SYSTEM_ADMIN' && auction.companyId !== user.companyId)) {
            logger.warn(`Unauthorized join blocked: Staff ${user.email} attempted out-of-scope auction ${auctionId}`);
            socket.emit('join.rejected', { reason: 'FORBIDDEN' });
            return;
          }
          await socket.join(`auction:${auctionId}`);
          await socket.join(`auction:${auctionId}:admin`);
          socket.emit('join.accepted', { auctionId });
        }
      } catch (err) {
        logger.error('Socket join error:', { error: String(err) });
        socket.emit('join.rejected', { reason: 'SERVER_ERROR' });
      }
    });

    socket.on('ping_measure', (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    socket.on('disconnect', () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      logger.info(`Socket disconnected: ${socket.id} (${user.email})`);
    });
  });

  // Background ticker loop (checks active auctions every 1 second).
  // Guarded so a slow database can never stack overlapping ticks.
  let tickRunning = false;
  const ticker = setInterval(async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const now = new Date();

      // Find all auctions in LIVE or OVERTIME states
      const activeAuctions = await prisma.auction.findMany({
        where: {
          state: {
            in: [AuctionState.LIVE, AuctionState.OVERTIME],
          },
          enabled: true,
        },
        select: { id: true, endAt: true },
      });

      for (const auction of activeAuctions) {
        if (!auction.endAt) continue;

        const endMs = auction.endAt.getTime();
        const nowMs = now.getTime();

        if (nowMs >= endMs) {
          // Auction has completed. updateMany with a state guard makes the
          // transition idempotent even if an admin stops it in the same tick.
          const closed = await prisma.auction.updateMany({
            where: { id: auction.id, state: { in: [AuctionState.LIVE, AuctionState.OVERTIME] } },
            data: { state: AuctionState.COMPLETED, enabled: false },
          });

          if (closed.count > 0) {
            await prisma.auditLog.create({
              data: {
                action: 'COMPLETED_AUTO',
                entity: 'Auction',
                entityId: auction.id,
                actorRole: null,
                payload: { reason: 'Authoritative server close time reached' },
              },
            });

            io.to(`auction:${auction.id}`).emit('auction.closed', {
              auctionId: auction.id,
              state: AuctionState.COMPLETED,
            });

            logger.info(`Auction ${auction.id} automatically completed`);
          }
        } else {
          // Broadcast countdown timer update. serverNow lets clients compute an
          // offset so their displayed countdown never trusts the local clock.
          const remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));
          io.to(`auction:${auction.id}`).emit('auction.timer.updated', {
            auctionId: auction.id,
            remainingSeconds,
            endAt: auction.endAt,
            serverNow: now.toISOString(),
          });
        }
      }

      // Automatically transition PUBLISHED auctions to LIVE once startAt is reached.
      const pendingAuctions = await prisma.auction.findMany({
        where: {
          state: AuctionState.PUBLISHED,
          enabled: true,
          startAt: { lte: now },
        },
        select: { id: true },
      });

      for (const upcoming of pendingAuctions) {
        const started = await prisma.auction.updateMany({
          where: { id: upcoming.id, state: AuctionState.PUBLISHED },
          data: { state: AuctionState.LIVE },
        });
        if (started.count === 0) continue;

        await prisma.auditLog.create({
          data: {
            action: 'LIVE_AUTO',
            entity: 'Auction',
            entityId: upcoming.id,
            payload: { reason: 'Start time reached' },
          },
        });

        io.to(`auction:${upcoming.id}`).emit('auction.state.changed', {
          auctionId: upcoming.id,
          state: AuctionState.LIVE,
        });

        io.to(`auction:${upcoming.id}`).emit('auction.started', {
          auctionId: upcoming.id,
        });

        logger.info(`Auction ${upcoming.id} transitioned to LIVE automatically`);
      }
    } catch (err) {
      logger.error('Error in background auction timer loop:', { error: String(err) });
    } finally {
      tickRunning = false;
    }
  }, 1000);

  ticker.unref();
};
