import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandlers';

export const getAuctionReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bidRuleSnapshot: true,
        participants: {
          include: {
            vendor: true,
            bids: { orderBy: { timestamp: 'asc' } },
          },
        },
        bids: {
          orderBy: { timestamp: 'desc' },
          include: {
            participant: {
              include: { vendor: true },
            },
          },
        },
      },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404, 'NOT_FOUND'));
    }

    // Company scoping: staff can only read reports for their own company's auctions.
    if (req.user!.role !== 'SYSTEM_ADMIN' && auction.companyId !== req.user!.companyId) {
      return next(new AppError('Auction not found', 404, 'NOT_FOUND'));
    }

    // 1. Compile participation funnel stats
    const totalInvited = auction.participants.length;
    const termsAcceptedCount = auction.participants.filter(p => p.acceptedTerms).length;
    const bidsPlacedCount = auction.participants.filter(p => p.bids.length > 0).length;

    // Real logged-in count: distinct vendor accounts that recorded a login
    // audit event scoped to this auction.
    const loginLogs = await prisma.auditLog.findMany({
      where: {
        action: 'VENDOR_LOGIN',
        payload: { path: ['auctionId'], equals: id },
      },
      select: { actorId: true },
    });
    const loggedInCount = new Set(loginLogs.map(l => l.actorId).filter(Boolean)).size;

    const participationFunnel = {
      invited: totalInvited,
      loggedIn: loggedInCount,
      termsAccepted: termsAcceptedCount,
      bidsSubmitted: bidsPlacedCount,
    };

    // 2. Compile comparative statement table
    const isReverse = auction.bidRuleSnapshot?.auctionType === 'REVERSE';
    const rankings = auction.participants.map(p => {
      // Find lowest amount bid (or highest)
      const personalBids = p.bids.map(b => Number(b.amount));
      const finalAmount = personalBids.length > 0
        ? (isReverse ? Math.min(...personalBids) : Math.max(...personalBids))
        : null;

      const personalEffs = p.bids.map(b => Number(b.effectiveTotal));
      const finalEffective = personalEffs.length > 0
        ? (isReverse ? Math.min(...personalEffs) : Math.max(...personalEffs))
        : null;

      // Bids are ordered oldest-first, so the initial bid is the first entry.
      const initialBid = p.bids.length > 0 ? Number(p.bids[0].amount) : null;
      const initialEffective = p.bids.length > 0 ? Number(p.bids[0].effectiveTotal) : null;

      // Improvement percentage: difference from initial to final
      let improvementPercent = 0;
      if (initialEffective && finalEffective && initialEffective !== finalEffective) {
        improvementPercent = ((initialEffective - finalEffective) / initialEffective) * 100;
        if (!isReverse) {
          improvementPercent = ((finalEffective - initialEffective) / initialEffective) * 100;
        }
      }

      return {
        vendorName: p.vendor.name,
        email: p.vendor.email,
        initialBid,
        initialEffective,
        finalBid: finalAmount,
        finalEffective,
        improvementPercent: Number(improvementPercent.toFixed(2)),
        bidsCount: p.bids.length,
      };
    });

    // Sort rankings
    rankings.sort((a, b) => {
      if (a.finalEffective === null) return 1;
      if (b.finalEffective === null) return -1;
      return isReverse ? a.finalEffective - b.finalEffective : b.finalEffective - a.finalEffective;
    });

    // Add explicit rank index
    const rankingsWithIndex = rankings.map((r, index) => ({
      rank: r.finalEffective !== null ? index + 1 : null,
      ...r,
    }));

    // 3. Chronological bid history log
    const bidHistory = auction.bids.map((b, index) => ({
      sequenceNumber: auction.bids.length - index,
      amount: Number(b.amount),
      effectiveTotal: Number(b.effectiveTotal),
      timestamp: b.timestamp,
      vendorName: b.participant.vendor.name,
      submittedAsSurrogate: b.submittedAsSurrogate,
    }));

    // 4. Fetch scoped audit trail
    const auditTrail = await prisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          id: auction.id,
          title: auction.title,
          description: auction.description,
          state: auction.state,
          startAt: auction.startAt,
          endAt: auction.endAt,
          createdAt: auction.createdAt,
          baseCurrency: auction.baseCurrency,
          rules: auction.bidRuleSnapshot,
        },
        participationFunnel,
        rankings: rankingsWithIndex,
        bidHistory,
        auditTrail,
      },
    });
  } catch (error) {
    next(error);
  }
};
