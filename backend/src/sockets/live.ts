import { Server, Socket } from 'socket.io';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { AuctionState } from '@prisma/client';

export const setupSocketLiveEngine = (io: Server) => {
  // Join room helper
  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('join', async (data: { auctionId: string; role: string; vendorId?: string }) => {
      const { auctionId, role, vendorId } = data;
      if (!auctionId) return;

      // Join base auction room for general broadcast
      socket.join(`auction:${auctionId}`);
      logger.info(`Socket ${socket.id} joined room: auction:${auctionId}`);

      // Join role-specific controls
      if (['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER'].includes(role)) {
        socket.join(`auction:${auctionId}:admin`);
        logger.info(`Socket ${socket.id} joined admin room: auction:${auctionId}:admin`);
      } else if (role === 'VENDOR' && vendorId) {
        socket.join(`auction:${auctionId}:vendor:${vendorId}`);
        logger.info(`Socket ${socket.id} joined vendor room: auction:${auctionId}:vendor:${vendorId}`);
      }
    });

    socket.on('ping_measure', (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
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
