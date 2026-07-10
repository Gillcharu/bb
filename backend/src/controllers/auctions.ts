import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandlers';
import { AuctionState, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// Helper to log system/user events to AuditLog
const logAuditEvent = async (
  action: string,
  entity: string,
  entityId: string,
  actorId: string | undefined,
  actorRole: Role | undefined,
  payload: any = {},
  ip: string | undefined = undefined
) => {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        actorId: actorId || null,
        actorRole: actorRole || null,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
        ipAddress: ip || null,
      },
    });
  } catch (err) {
    console.error('Audit log write error:', err);
  }
};

// 1. List all auctions with filters
export const listAuctions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, type, search } = req.query;

    const whereClause: any = {};

    // Scope check: internal users see company's auctions, observers see assigned
    if (req.user && req.user.role !== 'SYSTEM_ADMIN') {
      whereClause.companyId = req.user.companyId;
    }

    if (status) {
      whereClause.state = status as AuctionState;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const auctions = await prisma.auction.findMany({
      where: whereClause,
      include: {
        owner: { select: { id: true, email: true } },
        approver: { select: { id: true, email: true } },
        bidRuleSnapshot: true,
        participants: {
          include: {
            vendor: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: auctions,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get public details (already defined but extended for safety)
export const getPublicAuctionDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    let auction: any = null;
    const keyword = id.toLowerCase();

    if (['draft', 'published', 'live', 'completed'].includes(keyword)) {
      auction = await prisma.auction.findFirst({
        where: { state: keyword.toUpperCase() as any },
        select: { id: true, title: true, state: true, startAt: true, endAt: true },
      });
    } else {
      auction = await prisma.auction.findUnique({
        where: { id },
        select: { id: true, title: true, state: true, startAt: true, endAt: true },
      });
    }

    if (!auction) {
      return next(new AppError('Auction not found or access link is invalid', 404));
    }

    return res.status(200).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Get detailed auction config (Internal Only)
export const getAuctionDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true } },
        approver: { select: { id: true, email: true } },
        bidRuleSnapshot: true,
        participants: {
          include: {
            vendor: true,
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
      return next(new AppError('Auction not found', 404));
    }

    return res.status(200).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Create Draft Auction
export const createAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return next(new AppError('Auction title is required', 400));
    }

    const auction = await prisma.auction.create({
      data: {
        title,
        description: description || '',
        state: AuctionState.DRAFT,
        companyId: req.user!.companyId,
        ownerId: req.user!.id,
      },
    });

    // Create empty bid rules record
    await prisma.bidRuleSnapshot.create({
      data: {
        auctionId: auction.id,
        conversionRate: 1.0,
        loadingPercent: 0.0,
        fixedLoading: 0.0,
      },
    });

    await logAuditEvent(
      'AUCTION_CREATED',
      'Auction',
      auction.id,
      req.user?.id,
      req.user?.role,
      { title }
    );

    return res.status(201).json({
      success: true,
      data: auction,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Update Draft configuration
export const updateAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      startAt,
      endAt,
      approverId,
      baseCurrency,
      // Rules Snapshot fields
      conversionRate,
      loadingPercent,
      fixedLoading,
      minDecrement,
      auctionType,
      overtimeEnabled,
      overtimeWindowMins,
      overtimeExtensionMins,
      overtimeTriggerRank,
      maxExtensions,
      rankVisibility,
      // Participants list
      participantVendorIds,
    } = req.body;

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    if (auction.state !== AuctionState.DRAFT && auction.state !== AuctionState.REJECTED) {
      if (req.user?.role !== 'SYSTEM_ADMIN') {
        return next(new AppError('Cannot edit an auction that is already submitted or published', 400));
      }
    }

    // Perform updates
    const updatedAuction = await prisma.auction.update({
      where: { id },
      data: {
        title: title !== undefined ? title : auction.title,
        description: description !== undefined ? description : auction.description,
        startAt: startAt !== undefined ? (startAt ? new Date(startAt) : null) : auction.startAt,
        endAt: endAt !== undefined ? (endAt ? new Date(endAt) : null) : auction.endAt,
        approverId: approverId !== undefined ? approverId : auction.approverId,
        baseCurrency: baseCurrency !== undefined ? baseCurrency : auction.baseCurrency,
        state: (req.user?.role === 'SYSTEM_ADMIN' && req.body.state !== undefined) ? req.body.state : auction.state,
      },
    });

    // Handle rule snapshots
    if (
      conversionRate !== undefined ||
      loadingPercent !== undefined ||
      fixedLoading !== undefined ||
      minDecrement !== undefined ||
      auctionType !== undefined ||
      overtimeEnabled !== undefined ||
      overtimeWindowMins !== undefined ||
      overtimeExtensionMins !== undefined ||
      overtimeTriggerRank !== undefined ||
      maxExtensions !== undefined ||
      rankVisibility !== undefined
    ) {
      await prisma.bidRuleSnapshot.upsert({
        where: { auctionId: id },
        create: {
          auctionId: id,
          conversionRate: conversionRate !== undefined ? Number(conversionRate) : 1.0,
          loadingPercent: loadingPercent !== undefined ? Number(loadingPercent) : 0.0,
          fixedLoading: fixedLoading !== undefined ? Number(fixedLoading) : 0.0,
          minDecrement: minDecrement !== undefined ? Number(minDecrement) : 100.0,
          auctionType: auctionType !== undefined ? String(auctionType) : 'REVERSE',
          overtimeEnabled: overtimeEnabled !== undefined ? Boolean(overtimeEnabled) : true,
          overtimeWindowMins: overtimeWindowMins !== undefined ? Number(overtimeWindowMins) : 3,
          overtimeExtensionMins: overtimeExtensionMins !== undefined ? Number(overtimeExtensionMins) : 5,
          overtimeTriggerRank: overtimeTriggerRank !== undefined ? String(overtimeTriggerRank) : 'RANK_1',
          maxExtensions: maxExtensions !== undefined ? (maxExtensions ? Number(maxExtensions) : null) : null,
          rankVisibility: rankVisibility !== undefined ? String(rankVisibility) : 'OWN_RANK_ONLY',
        },
        update: {
          conversionRate: conversionRate !== undefined ? Number(conversionRate) : undefined,
          loadingPercent: loadingPercent !== undefined ? Number(loadingPercent) : undefined,
          fixedLoading: fixedLoading !== undefined ? Number(fixedLoading) : undefined,
          minDecrement: minDecrement !== undefined ? Number(minDecrement) : undefined,
          auctionType: auctionType !== undefined ? String(auctionType) : undefined,
          overtimeEnabled: overtimeEnabled !== undefined ? Boolean(overtimeEnabled) : undefined,
          overtimeWindowMins: overtimeWindowMins !== undefined ? Number(overtimeWindowMins) : undefined,
          overtimeExtensionMins: overtimeExtensionMins !== undefined ? Number(overtimeExtensionMins) : undefined,
          overtimeTriggerRank: overtimeTriggerRank !== undefined ? String(overtimeTriggerRank) : undefined,
          maxExtensions: maxExtensions !== undefined ? (maxExtensions ? Number(maxExtensions) : null) : undefined,
          rankVisibility: rankVisibility !== undefined ? String(rankVisibility) : undefined,
        },
      });
    }

    // Handle participant additions/removals
    if (participantVendorIds && Array.isArray(participantVendorIds)) {
      // Clear existing participants
      await prisma.participant.deleteMany({
        where: { auctionId: id },
      });

      // Insert new participants
      const participantCreates = participantVendorIds.map((vendorId: string) => ({
        auctionId: id,
        vendorId,
      }));

      await prisma.participant.createMany({
        data: participantCreates,
      });
    }

    await logAuditEvent(
      'AUCTION_UPDATED',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      req.body
    );

    return res.status(200).json({
      success: true,
      data: updatedAuction,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Submit for approval
export const submitForApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: { approver: true },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    if (auction.state !== AuctionState.DRAFT && auction.state !== AuctionState.REJECTED) {
      return next(new AppError('Auction must be in DRAFT or REJECTED state to submit for approval', 400));
    }

    if (!auction.approverId) {
      return next(new AppError('An assigned Approver is required before submitting', 400));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.PENDING_APPROVAL },
    });

    await logAuditEvent(
      'SUBMITTED_FOR_APPROVAL',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      { approver: auction.approver?.email }
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Approve Auction
export const approveAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    if (auction.state !== AuctionState.PENDING_APPROVAL) {
      return next(new AppError('Auction is not awaiting approval', 400));
    }

    if (req.user?.role !== Role.APPROVER && req.user?.role !== Role.SYSTEM_ADMIN) {
      return next(new AppError('Only the assigned Approver can approve this auction', 403));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.APPROVED },
    });

    await logAuditEvent(
      'APPROVED',
      'Auction',
      id,
      req.user?.id,
      req.user?.role
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 8. Reject Auction
export const rejectAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || comment.trim().length < 10) {
      return next(new AppError('A reject comment of at least 10 characters is required', 400));
    }

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    if (auction.state !== AuctionState.PENDING_APPROVAL) {
      return next(new AppError('Auction is not awaiting approval', 400));
    }

    if (req.user?.role !== Role.APPROVER && req.user?.role !== Role.SYSTEM_ADMIN) {
      return next(new AppError('Only the assigned Approver can reject this auction', 403));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.REJECTED },
    });

    await logAuditEvent(
      'REJECTED',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      { comment }
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 9. Run Publish Validation Check
export const validatePublish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bidRuleSnapshot: true,
        participants: {
          include: { vendor: true },
        },
      },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    const checklist: any[] = [];

    // 1. Details check
    const hasDetails = !!auction.title && !!auction.description;
    checklist.push({ name: 'Auction details complete', passed: hasDetails, message: hasDetails ? 'Passed' : 'Missing title or description' });

    // 2. Dates check
    const now = new Date();
    const hasValidDates = !!auction.startAt && !!auction.endAt && auction.startAt > now && auction.endAt > auction.startAt;
    checklist.push({ name: 'Valid auction schedule', passed: hasValidDates, message: hasValidDates ? 'Passed' : 'Start time must be in the future, and end time must follow start time' });

    // 3. Participants check
    const hasVendors = auction.participants.length > 0;
    checklist.push({ name: 'Vendor participants assigned', passed: hasVendors, message: hasVendors ? `${auction.participants.length} vendor(s) mapped` : 'At least one participant required' });

    // 4. Documents check
    const termsDoc = await prisma.documentTemplate.findFirst({ where: { type: 'TERMS' } });
    const disclosureDoc = await prisma.documentTemplate.findFirst({ where: { type: 'DISCLOSURE' } });
    const rulesDoc = await prisma.documentTemplate.findFirst({ where: { type: 'RULES' } });
    const hasDocs = !!termsDoc && !!disclosureDoc && !!rulesDoc;
    checklist.push({ name: 'Terms & disclosures attached', passed: hasDocs, message: hasDocs ? 'Verified templates loaded' : 'Default compliance document templates missing' });

    // 5. Bid rules check
    const hasRules = !!auction.bidRuleSnapshot;
    checklist.push({ name: 'Pricing rules snapshot generated', passed: hasRules, message: hasRules ? 'Passed' : 'Verify step 2 rule configurations' });

    // 6. Approval check
    const isApproved = auction.state === AuctionState.APPROVED;
    checklist.push({ name: 'All required approvals obtained', passed: isApproved, message: isApproved ? 'Approved by supervisor' : 'Auction must be APPROVED before publishing' });

    const allPassed = checklist.every(c => c.passed);

    return res.status(200).json({
      success: true,
      allPassed,
      checklist,
    });
  } catch (error) {
    next(error);
  }
};

// 10. Publish Auction & Generate Vendor Credentials
export const publishAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        participants: {
          include: { vendor: true },
        },
      },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    if (auction.state !== AuctionState.APPROVED) {
      return next(new AppError('Auction must be APPROVED to publish', 400));
    }

    // Automatically create VENDOR user login credentials if they don't exist
    for (const participant of auction.participants) {
      const vendorEmail = participant.vendor.email;
      
      // Upsert a VENDOR role user matching this vendor email
      let user = await prisma.user.findUnique({ where: { email: vendorEmail } });
      if (!user) {
        // Generate a cryptographically secure random temporary password
        const temporaryPassword = crypto.randomBytes(12).toString('hex');
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);
        user = await prisma.user.create({
          data: {
            email: vendorEmail,
            password: passwordHash,
            role: Role.VENDOR,
            companyId: auction.companyId,
          },
        });
        logger.info(`Generated secure vendor credentials for ${vendorEmail}. Temp Password: ${temporaryPassword}`);
      }

      // Update participant record to show they are invited
      await prisma.participant.update({
        where: { id: participant.id },
        data: { invitedAt: new Date() },
      });
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.PUBLISHED, enabled: true },
    });

    await logAuditEvent(
      'PUBLISHED',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      { invitedCount: auction.participants.length }
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 11. Duplicate Config into a New Draft
export const duplicateAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bidRuleSnapshot: true,
        participants: true,
      },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    // Clone base auction properties
    const newAuction = await prisma.auction.create({
      data: {
        title: `${auction.title} (Copy)`,
        description: auction.description,
        state: AuctionState.DRAFT,
        companyId: auction.companyId,
        ownerId: req.user!.id,
      },
    });

    // Clone rules
    if (auction.bidRuleSnapshot) {
      await prisma.bidRuleSnapshot.create({
        data: {
          auctionId: newAuction.id,
          conversionRate: auction.bidRuleSnapshot.conversionRate,
          loadingPercent: auction.bidRuleSnapshot.loadingPercent,
          fixedLoading: auction.bidRuleSnapshot.fixedLoading,
        },
      });
    }

    // Clone participant list
    if (auction.participants.length > 0) {
      const cloner = auction.participants.map(p => ({
        auctionId: newAuction.id,
        vendorId: p.vendorId,
      }));
      await prisma.participant.createMany({ data: cloner });
    }

    await logAuditEvent(
      'AUCTION_DUPLICATED',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      { newAuctionId: newAuction.id }
    );

    return res.status(201).json({
      success: true,
      data: newAuction,
    });
  } catch (error) {
    next(error);
  }
};

// 12. Cancel Auction
export const cancelAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.CANCELLED, enabled: false },
    });

    await logAuditEvent(
      'CANCELLED',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      { comment }
    );

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 13. Submit Bid (Vendor / Surrogate)
import crypto from 'crypto';
import { Server } from 'socket.io';

export const submitBid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { amount, note, vendorId } = req.body;

    if (!amount || Number(amount) <= 0) {
      return next(new AppError('A positive bid amount is required', 400));
    }

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: { bidRuleSnapshot: true },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    if (auction.state !== AuctionState.LIVE && auction.state !== AuctionState.OVERTIME) {
      return next(new AppError('This auction is not currently accepting bids', 400, 'NOT_LIVE'));
    }

    if (!auction.enabled) {
      return next(new AppError('This auction is currently paused/disabled by the administrator', 400, 'NOT_LIVE'));
    }

    // Identify participant
    let participant;
    if (req.user!.role === 'VENDOR') {
      participant = await prisma.participant.findFirst({
        where: { auctionId: id, vendor: { email: req.user!.email } },
        include: { vendor: true },
      });
    } else {
      // Surrogate bid on behalf of another vendorId
      if (!vendorId) {
        return next(new AppError('vendorId is required for surrogate bidding', 400));
      }
      participant = await prisma.participant.findFirst({
        where: { auctionId: id, vendorId },
        include: { vendor: true },
      });
    }

    if (!participant) {
      return next(new AppError('Vendor participant record not found', 404));
    }

    if (participant.blocked) {
      return next(new AppError('Your bidding access has been restricted', 403, 'BLOCKED'));
    }

    // Retrieve active formula variables
    const rule = auction.bidRuleSnapshot;
    const rate = rule ? Number(rule.conversionRate) : 1.0;
    const loadPercent = rule ? Number(rule.loadingPercent) : 0.0;
    const fixedLoad = rule ? Number(rule.fixedLoading) : 0.0;
    const minStep = rule ? Number(rule.minDecrement) : 100.0;
    const isReverse = rule ? rule.auctionType === 'REVERSE' : true;

    // Calculate effective Total
    const amountNum = Number(amount);
    const effectiveTotal = (amountNum * rate) + fixedLoad + (amountNum * loadPercent / 100);

    // Enforce bid decrement step vs current leading L1 bid
    const leadingBid = await prisma.bid.findFirst({
      where: { auctionId: id },
      orderBy: { effectiveTotal: isReverse ? 'asc' : 'desc' },
    });

    if (leadingBid) {
      const leadingVal = Number(leadingBid.effectiveTotal);
      if (isReverse) {
        // Reverse Auction: new bid must be lower than L1 by at least decrement
        const maxAllowed = leadingVal - minStep;
        if (effectiveTotal > maxAllowed) {
          return next(new AppError(`Your bid does not meet the minimum required decrement. Maximum allowed effective value is ${maxAllowed}`, 400, 'INVALID_DECREMENT'));
        }
      } else {
        // Forward Auction: new bid must be higher than H1 by at least increment
        const minAllowed = leadingVal + minStep;
        if (effectiveTotal < minAllowed) {
          return next(new AppError(`Your bid does not meet the minimum required increment. Minimum allowed effective value is ${minAllowed}`, 400, 'INVALID_INCREMENT'));
        }
      }
    }

    // Check for late bid
    if (auction.endAt && new Date() > auction.endAt) {
      return next(new AppError('The auction closed before your bid was received.', 400, 'CLOSED'));
    }

    // Get previous hash for hash chain
    const lastBid = await prisma.bid.findFirst({
      where: { auctionId: id },
      orderBy: { timestamp: 'desc' },
    });
    const prevHash = lastBid ? lastBid.hash : 'genesis';
    const timestamp = new Date();
    const hash = crypto
      .createHash('sha256')
      .update(`${amountNum}-${timestamp.getTime()}-${prevHash}`)
      .digest('hex');

    // Create Bid record
    const newBid = await prisma.bid.create({
      data: {
        amount: amountNum,
        conversionRate: rate,
        loadingPercent: loadPercent,
        fixedLoading: fixedLoad,
        effectiveTotal: effectiveTotal,
        timestamp,
        auctionId: id,
        participantId: participant.id,
        submittedAsSurrogate: req.user!.role !== 'VENDOR',
        hash,
        previousHash: lastBid ? lastBid.hash : null,
      },
    });

    // Check overtime sniper rules
    let isExtended = false;
    let newEnd = auction.endAt;

    if (rule && rule.overtimeEnabled && auction.endAt) {
      const remainingMs = auction.endAt.getTime() - timestamp.getTime();
      const triggerWindowMs = rule.overtimeWindowMins * 60 * 1000;

      if (remainingMs > 0 && remainingMs <= triggerWindowMs) {
        // Extend Close time
        newEnd = new Date(auction.endAt.getTime() + rule.overtimeExtensionMins * 60 * 1000);
        await prisma.auction.update({
          where: { id },
          data: { endAt: newEnd, state: AuctionState.OVERTIME },
        });
        isExtended = true;
      }
    }

    // Log to Audit Log
    await logAuditEvent(
      newBid.submittedAsSurrogate ? 'SURROGATE_BID_SUBMITTED' : 'BID_SUBMITTED',
      'Bid',
      newBid.id,
      req.user?.id,
      req.user?.role,
      { amount: amountNum, effectiveTotal, isExtended, newEnd },
      req.ip
    );

    // Broadcast to Socket.IO room
    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}`).emit('bid.submitted', {
        bid: {
          id: newBid.id,
          amount: newBid.amount,
          effectiveTotal: newBid.effectiveTotal,
          timestamp: newBid.timestamp,
          vendorName: participant.vendor.name,
          submittedAsSurrogate: newBid.submittedAsSurrogate,
        },
      });

      if (isExtended && newEnd) {
        io.to(`auction:${id}`).emit('auction.extended', {
          auctionId: id,
          endAt: newEnd,
          extensionMins: rule!.overtimeExtensionMins,
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: newBid,
    });
  } catch (error) {
    next(error);
  }
};

// 14. Get Live Console State (Sync leaderboard & historical lines)
export const getLiveState = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bidRuleSnapshot: true,
        participants: {
          include: {
            vendor: true,
            bids: {
              orderBy: { timestamp: 'desc' },
              take: 1,
            },
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
      return next(new AppError('Auction not found', 404));
    }

    // Format rankings table based on leading bids
    const rankings = auction.participants.map(p => {
      const leadingBid = p.bids[0];
      return {
        vendorId: p.vendorId,
        vendorName: p.vendor.name,
        vendorEmail: p.vendor.email,
        blocked: p.blocked,
        acceptedTerms: p.acceptedTerms,
        currentBid: leadingBid ? Number(leadingBid.amount) : null,
        effectiveTotal: leadingBid ? Number(leadingBid.effectiveTotal) : null,
        lastBidAt: leadingBid ? leadingBid.timestamp : null,
        submittedAsSurrogate: leadingBid ? leadingBid.submittedAsSurrogate : false,
      };
    });

    // Sort by effectiveTotal (Reverse: lower is better)
    const isReverse = auction.bidRuleSnapshot?.auctionType === 'REVERSE';
    rankings.sort((a, b) => {
      if (a.effectiveTotal === null) return 1;
      if (b.effectiveTotal === null) return -1;
      return isReverse ? a.effectiveTotal - b.effectiveTotal : b.effectiveTotal - a.effectiveTotal;
    });

    const formattedBids = auction.bids.map(b => ({
      id: b.id,
      amount: Number(b.amount),
      effectiveTotal: Number(b.effectiveTotal),
      timestamp: b.timestamp,
      vendorName: b.participant.vendor.name,
      submittedAsSurrogate: b.submittedAsSurrogate,
    }));

    return res.status(200).json({
      success: true,
      data: {
        id: auction.id,
        title: auction.title,
        state: auction.state,
        enabled: auction.enabled,
        startAt: auction.startAt,
        endAt: auction.endAt,
        rules: auction.bidRuleSnapshot,
        rankings,
        bidHistory: formattedBids,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 15. Admin Override: Manual Extend Close Time
export const extendAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { durationMinutes } = req.body;

    if (!durationMinutes || Number(durationMinutes) <= 0) {
      return next(new AppError('A valid positive extension duration is required', 400));
    }

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction || !auction.endAt) {
      return next(new AppError('Auction close time not found', 404));
    }

    const newEnd = new Date(auction.endAt.getTime() + Number(durationMinutes) * 60 * 1000);
    const updated = await prisma.auction.update({
      where: { id },
      data: { endAt: newEnd, state: AuctionState.OVERTIME },
    });

    await logAuditEvent(
      'MANUAL_EXTEND',
      'Auction',
      id,
      req.user?.id,
      req.user?.role,
      { durationMinutes, newEnd }
    );

    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}`).emit('auction.extended', {
        auctionId: id,
        endAt: newEnd,
        extensionMins: durationMinutes,
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 16. Admin Override: Manual Stop Auction
export const stopAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.COMPLETED, enabled: false },
    });

    await logAuditEvent(
      'MANUAL_STOP',
      'Auction',
      id,
      req.user?.id,
      req.user?.role
    );

    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}`).emit('auction.closed', {
        auctionId: id,
        state: AuctionState.COMPLETED,
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 17. Admin Override: Pause Auction (Disable Bids)
export const pauseAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { enabled: false },
    });

    await logAuditEvent(
      'MANUAL_PAUSE',
      'Auction',
      id,
      req.user?.id,
      req.user?.role
    );

    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}`).emit('auction.state.changed', {
        auctionId: id,
        enabled: false,
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 18. Admin Override: Resume Auction (Enable Bids)
export const resumeAuction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const auction = await prisma.auction.findUnique({ where: { id } });

    if (!auction) {
      return next(new AppError('Auction not found', 404));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { enabled: true },
    });

    await logAuditEvent(
      'MANUAL_RESUME',
      'Auction',
      id,
      req.user?.id,
      req.user?.role
    );

    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}`).emit('auction.state.changed', {
        auctionId: id,
        enabled: true,
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 19. Admin Override: Block Vendor
export const blockVendor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, vendorId } = req.params;

    const participant = await prisma.participant.findFirst({
      where: { auctionId: id, vendorId },
      include: { vendor: true },
    });

    if (!participant) {
      return next(new AppError('Vendor participant record not found', 404));
    }

    await prisma.participant.update({
      where: { id: participant.id },
      data: { blocked: true },
    });

    await logAuditEvent(
      'VENDOR_BLOCKED',
      'AuctionParticipant',
      participant.id,
      req.user?.id,
      req.user?.role,
      { vendorName: participant.vendor.name }
    );

    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}:vendor:${vendorId}`).emit('participant.blocked', {
        auctionId: id,
        vendorId,
        blocked: true,
      });
      io.to(`auction:${id}:admin`).emit('participant.rank.updated');
    }

    return res.status(200).json({
      success: true,
      message: 'Vendor successfully blocked from auction session',
    });
  } catch (error) {
    next(error);
  }
};

// 20. Admin Override: Unblock Vendor
export const unblockVendor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, vendorId } = req.params;

    const participant = await prisma.participant.findFirst({
      where: { auctionId: id, vendorId },
      include: { vendor: true },
    });

    if (!participant) {
      return next(new AppError('Vendor participant record not found', 404));
    }

    await prisma.participant.update({
      where: { id: participant.id },
      data: { blocked: false },
    });

    await logAuditEvent(
      'VENDOR_UNBLOCKED',
      'AuctionParticipant',
      participant.id,
      req.user?.id,
      req.user?.role,
      { vendorName: participant.vendor.name }
    );

    const io = req.app.get('io') as Server;
    if (io) {
      io.to(`auction:${id}:vendor:${vendorId}`).emit('participant.blocked', {
        auctionId: id,
        vendorId,
        blocked: false,
      });
      io.to(`auction:${id}:admin`).emit('participant.rank.updated');
    }

    return res.status(200).json({
      success: true,
      message: 'Vendor successfully unblocked',
    });
  } catch (error) {
    next(error);
  }
};

// 21. Vendor Action: Accept Compliance Terms
export const acceptTerms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { ipAddress } = req.body;

    const participant = await prisma.participant.findFirst({
      where: {
        auctionId: id,
        vendor: { email: req.user!.email },
      },
      include: { vendor: true },
    });

    if (!participant) {
      return next(new AppError('Vendor participant record not found', 404));
    }

    // Update terms acceptance status
    await prisma.participant.update({
      where: { id: participant.id },
      data: { acceptedTerms: true },
    });

    // Create VendorAcceptance records for the active template versions
    const docs = await prisma.documentTemplate.findMany({
      orderBy: { version: 'desc' },
    });
    
    // De-duplicate by type (take the latest version)
    const latestDocs: any = {};
    for (const doc of docs) {
      if (!latestDocs[doc.type]) {
        latestDocs[doc.type] = doc;
      }
    }

    for (const type of Object.keys(latestDocs)) {
      const doc = latestDocs[type];
      await prisma.vendorAcceptance.create({
        data: {
          vendorId: participant.vendorId,
          auctionId: id,
          documentId: doc.id,
          ipAddress: ipAddress || req.ip || '127.0.0.1',
        },
      });
    }

    await logAuditEvent(
      'VENDOR_TERMS_ACCEPTED',
      'AuctionParticipant',
      participant.id,
      req.user?.id,
      req.user?.role,
      { vendorName: participant.vendor.name },
      ipAddress || req.ip
    );

    return res.status(200).json({
      success: true,
      message: 'Compliance terms successfully accepted and logged',
    });
  } catch (error) {
    next(error);
  }
};

