import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { AuctionState } from '@prisma/client';

export const setupSocketLiveEngine = (io: Server) => {
  // Enforce JWT token verification middleware for all Socket.IO connections
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      logger.warn(`Connection rejected: Unauthenticated socket handshake on ${socket.id}`);
      return next(new Error('Authentication error: JWT token is required'));
    }

    try {
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        return next(new Error('Server configuration error: JWT secret not defined'));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        role: 'SYSTEM_ADMIN' | 'AUCTION_OWNER' | 'APPROVER' | 'OBSERVER' | 'VENDOR';
        companyId: string;
        auctionId?: string;
      };

      // Store verified token payload inside socket session state
      socket.data.user = decoded;
      return next();
    } catch (err) {
      logger.warn(`Connection rejected: Invalid or expired token socket handshake on ${socket.id}`);
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect();
      return;
    }
    logger.info(`Socket connected: ${socket.id} (User: ${user.email}, Role: ${user.role})`);

    socket.on('join', async (data: { auctionId: string }) => {
      const { auctionId } = data;
      if (!auctionId) return;

      // Enforce strict server-side authorization checks using verified token payload
      if (user.role === 'VENDOR') {
        if (user.auctionId !== auctionId) {
          logger.warn(`Unauthorized join blocked: Vendor ${user.email} attempted to access auction ID: ${auctionId}`);
          return;
        }
        socket.join(`auction:${auctionId}`);
        socket.join(`auction:${auctionId}:vendor:${user.id}`);
        logger.info(`Verified Vendor ${user.email} joined rooms for auction: ${auctionId}`);
      } else if (['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER'].includes(user.role)) {
        socket.join(`auction:${auctionId}`);
        socket.join(`auction:${auctionId}:admin`);
        logger.info(`Verified Staff ${user.email} (${user.role}) joined rooms for auction: ${auctionId}`);
      }
    });

    socket.on('ping_measure', (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id} (${user.email})`);
    });
  });

  // Background ticker loop (checks active auctions every 1 second)
  setInterval(async () => {
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
      });

      for (const auction of activeAuctions) {
        if (!auction.endAt) continue;

        const endMs = auction.endAt.getTime();
        const nowMs = now.getTime();

        if (nowMs >= endMs) {
          // Auction has completed!
          await prisma.auction.update({
            where: { id: auction.id },
            data: { state: AuctionState.COMPLETED, enabled: false },
          });

          // Log audit log event
          await prisma.auditLog.create({
            data: {
              action: 'COMPLETED_AUTO',
              entity: 'Auction',
              entityId: auction.id,
              actorRole: null,
              payload: { reason: 'Authoritative server close time reached' },
            },
          });

          // Broadcast closed status
          io.to(`auction:${auction.id}`).emit('auction.closed', {
            auctionId: auction.id,
            state: AuctionState.COMPLETED,
          });

          logger.info(`Auction ${auction.id} automatically completed`);
        } else {
          // Broadcast countdown timer update
          const remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));
          io.to(`auction:${auction.id}`).emit('auction.timer.updated', {
            auctionId: auction.id,
            remainingSeconds,
            endAt: auction.endAt,
          });
        }
      }

      // Check upcoming auctions: automatically transition DRAFT/PUBLISHED to LIVE if startAt is reached!
      const pendingAuctions = await prisma.auction.findMany({
        where: {
          state: AuctionState.PUBLISHED,
          enabled: true,
          startAt: { lte: now },
        },
      });

      for (const upcoming of pendingAuctions) {
        await prisma.auction.update({
          where: { id: upcoming.id },
          data: { state: AuctionState.LIVE },
        });

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

        logger.info(`Auction ${upcoming.id} transition to LIVE automatically`);
      }
    } catch (err) {
      logger.error('Error in background auction timer loop:', err);
    }
  }, 1000);
};
