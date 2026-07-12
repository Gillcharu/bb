import { Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandlers';
import { AuctionState, Prisma, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { AsyncLock } from '../utils/asyncLock';

const BCRYPT_COST = 12;

// Serializes bid transactions per auction within this process so a burst of
// bidders on one auction cannot exhaust the DB connection pool (see AsyncLock).
const bidLock = new AsyncLock();

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
    logger.error('Audit log write error:', { error: String(err) });
  }
};

// Company scoping guard: staff may only operate on auctions belonging to their
// own company. SYSTEM_ADMIN has cross-company access. Returns 404 (not 403) for
// out-of-scope auctions so resource existence is never leaked.
const assertCompanyScope = (req: Request, auction: { companyId: string } | null) => {
  if (!auction) {
    throw new AppError('Auction not found', 404, 'NOT_FOUND');
  }
  if (req.user!.role !== 'SYSTEM_ADMIN' && auction.companyId !== req.user!.companyId) {
    throw new AppError('Auction not found', 404, 'NOT_FOUND');
  }
};

const getIo = (req: Request): Server | undefined => req.app.get('io') as Server | undefined;

// 1. List all auctions with filters
export const listAuctions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search } = req.query;

    const whereClause: Prisma.AuctionWhereInput = {};

    // Scope check: internal users only see their own company's auctions.
    if (req.user!.role !== 'SYSTEM_ADMIN') {
      whereClause.companyId = req.user!.companyId;
    }

    if (status && typeof status === 'string' && (Object.values(AuctionState) as string[]).includes(status)) {
      whereClause.state = status as AuctionState;
    }

    if (search && typeof search === 'string') {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const auctions = await prisma.auction.findMany({
      where: whereClause,
      include: {
        owner: { select: { id: true, email: true } },
        approver: { select: { id: true, email: true } },
        bidRuleSnapshot: true,
        participants: { select: { id: true, vendorId: true, blocked: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return res.status(200).json({
      success: true,
      data: auctions,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Public invitation-context lookup (UUID access links only)
export const getPublicAuctionDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) {
      return next(new AppError('Auction not found or access link is invalid', 404, 'NOT_FOUND'));
    }

    const auction = await prisma.auction.findUnique({
      where: { id },
      select: { id: true, title: true, state: true, startAt: true, endAt: true },
    });

    if (!auction) {
      return next(new AppError('Auction not found or access link is invalid', 404, 'NOT_FOUND'));
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
            // Only the fields the detail view renders — no internal columns.
            vendor: { select: { id: true, name: true, email: true } },
          },
        },
        bids: {
          orderBy: { timestamp: 'desc' },
          take: 500,
          include: {
            participant: {
              include: { vendor: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    assertCompanyScope(req, auction);

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

    await logAuditEvent('AUCTION_CREATED', 'Auction', auction.id, req.user?.id, req.user?.role, { title });

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
    assertCompanyScope(req, auction);

    if (auction!.state !== AuctionState.DRAFT && auction!.state !== AuctionState.REJECTED) {
      if (req.user?.role !== 'SYSTEM_ADMIN') {
        return next(new AppError('Cannot edit an auction that is already submitted or published', 400));
      }
    }

    // Validate schedule against existing values when only one side changes.
    const nextStartAt = startAt !== undefined ? (startAt ? new Date(startAt) : null) : auction!.startAt;
    const nextEndAt = endAt !== undefined ? (endAt ? new Date(endAt) : null) : auction!.endAt;
    if (nextStartAt && nextEndAt && nextEndAt.getTime() <= nextStartAt.getTime()) {
      return next(new AppError('End time must be after start time', 400, 'INVALID_SCHEDULE'));
    }

    // Validate approver assignment: must be an APPROVER (or SYSTEM_ADMIN) in the same company.
    if (approverId !== undefined && approverId !== null && approverId !== auction!.approverId) {
      const approver = await prisma.user.findUnique({ where: { id: approverId } });
      if (
        !approver ||
        approver.companyId !== auction!.companyId ||
        (approver.role !== Role.APPROVER && approver.role !== Role.SYSTEM_ADMIN)
      ) {
        return next(new AppError('Assigned approver must be an Approver from your company', 400, 'INVALID_APPROVER'));
      }
    }

    // Perform updates
    const updatedAuction = await prisma.auction.update({
      where: { id },
      data: {
        title: title !== undefined ? title : auction!.title,
        description: description !== undefined ? description : auction!.description,
        startAt: nextStartAt,
        endAt: nextEndAt,
        approverId: approverId !== undefined ? approverId : auction!.approverId,
        baseCurrency: baseCurrency !== undefined ? String(baseCurrency).toUpperCase() : auction!.baseCurrency,
        state: req.user?.role === 'SYSTEM_ADMIN' && req.body.state ? req.body.state : auction!.state,
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
          maxExtensions: maxExtensions !== undefined && maxExtensions !== null ? Number(maxExtensions) : null,
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
          maxExtensions: maxExtensions !== undefined ? (maxExtensions !== null ? Number(maxExtensions) : null) : undefined,
          rankVisibility: rankVisibility !== undefined ? String(rankVisibility) : undefined,
        },
      });
    }

    // Handle participant additions/removals
    if (participantVendorIds && Array.isArray(participantVendorIds)) {
      const uniqueVendorIds: string[] = [...new Set(participantVendorIds as string[])];

      // Participants cannot be replaced once bids exist — that would orphan bid
      // records and corrupt the audit ledger.
      const bidCount = await prisma.bid.count({ where: { auctionId: id } });
      if (bidCount > 0) {
        return next(new AppError('Participants cannot be changed after bids have been placed', 400, 'BIDS_EXIST'));
      }

      // Every vendor must belong to the auction's company.
      const vendors = await prisma.vendor.findMany({
        where: { id: { in: uniqueVendorIds }, companyId: auction!.companyId },
        select: { id: true },
      });
      if (vendors.length !== uniqueVendorIds.length) {
        return next(new AppError('One or more selected vendors were not found in your vendor directory', 400, 'INVALID_VENDORS'));
      }

      await prisma.$transaction([
        prisma.participant.deleteMany({ where: { auctionId: id } }),
        prisma.participant.createMany({
          data: uniqueVendorIds.map((vendorId: string) => ({ auctionId: id, vendorId })),
        }),
      ]);
    }

    await logAuditEvent('AUCTION_UPDATED', 'Auction', id, req.user?.id, req.user?.role, req.body);

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
    assertCompanyScope(req, auction);

    if (auction!.state !== AuctionState.DRAFT && auction!.state !== AuctionState.REJECTED) {
      return next(new AppError('Auction must be in DRAFT or REJECTED state to submit for approval', 400));
    }

    if (!auction!.approverId) {
      return next(new AppError('An assigned Approver is required before submitting', 400));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.PENDING_APPROVAL },
    });

    await logAuditEvent('SUBMITTED_FOR_APPROVAL', 'Auction', id, req.user?.id, req.user?.role, {
      approver: auction!.approver?.email,
    });

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
    assertCompanyScope(req, auction);

    if (auction!.state !== AuctionState.PENDING_APPROVAL) {
      return next(new AppError('Auction is not awaiting approval', 400));
    }

    // Only the assigned approver (or a system admin) can decide.
    if (req.user!.role !== Role.SYSTEM_ADMIN && req.user!.id !== auction!.approverId) {
      return next(new AppError('Only the assigned Approver can approve this auction', 403, 'FORBIDDEN'));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.APPROVED },
    });

    await logAuditEvent('APPROVED', 'Auction', id, req.user?.id, req.user?.role);

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

    const auction = await prisma.auction.findUnique({ where: { id } });
    assertCompanyScope(req, auction);

    if (auction!.state !== AuctionState.PENDING_APPROVAL) {
      return next(new AppError('Auction is not awaiting approval', 400));
    }

    if (req.user!.role !== Role.SYSTEM_ADMIN && req.user!.id !== auction!.approverId) {
      return next(new AppError('Only the assigned Approver can reject this auction', 403, 'FORBIDDEN'));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.REJECTED },
    });

    await logAuditEvent('REJECTED', 'Auction', id, req.user?.id, req.user?.role, { comment });

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
        participants: { select: { id: true } },
      },
    });
    assertCompanyScope(req, auction);

    const checklist: { name: string; passed: boolean; message: string }[] = [];

    // 1. Details check
    const hasDetails = !!auction!.title && !!auction!.description;
    checklist.push({
      name: 'Auction details complete',
      passed: hasDetails,
      message: hasDetails ? 'Passed' : 'Missing title or description',
    });

    // 2. Dates check
    const now = new Date();
    const hasValidDates =
      !!auction!.startAt && !!auction!.endAt && auction!.startAt > now && auction!.endAt > auction!.startAt;
    checklist.push({
      name: 'Valid auction schedule',
      passed: hasValidDates,
      message: hasValidDates ? 'Passed' : 'Start time must be in the future, and end time must follow start time',
    });

    // 3. Participants check
    const hasVendors = auction!.participants.length > 0;
    checklist.push({
      name: 'Vendor participants assigned',
      passed: hasVendors,
      message: hasVendors ? `${auction!.participants.length} vendor(s) mapped` : 'At least one participant required',
    });

    // 4. Documents check — scoped to this auction's company.
    const docTypes = await prisma.documentTemplate.groupBy({
      by: ['type'],
      where: { companyId: auction!.companyId },
    });
    const availableTypes = docTypes.map(d => d.type);
    const hasDocs = ['TERMS', 'DISCLOSURE', 'RULES'].every(t => availableTypes.includes(t));
    checklist.push({
      name: 'Terms & disclosures attached',
      passed: hasDocs,
      message: hasDocs
        ? 'Verified templates loaded'
        : 'Create TERMS, DISCLOSURE and RULES templates in Settings before publishing',
    });

    // 5. Bid rules check
    const hasRules = !!auction!.bidRuleSnapshot;
    checklist.push({
      name: 'Pricing rules snapshot generated',
      passed: hasRules,
      message: hasRules ? 'Passed' : 'Verify step 2 rule configurations',
    });

    // 6. Approval check
    const isApproved = auction!.state === AuctionState.APPROVED;
    checklist.push({
      name: 'All required approvals obtained',
      passed: isApproved,
      message: isApproved ? 'Approved by supervisor' : 'Auction must be APPROVED before publishing',
    });

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
    assertCompanyScope(req, auction);

    if (auction!.state !== AuctionState.APPROVED) {
      return next(new AppError('Auction must be APPROVED to publish', 400));
    }

    if (!auction!.startAt || !auction!.endAt || auction!.startAt <= new Date() || auction!.endAt <= auction!.startAt) {
      return next(new AppError('Auction schedule is invalid; run publish validation first', 400, 'INVALID_SCHEDULE'));
    }

    // Automatically create VENDOR user login credentials if they don't exist.
    // Credential distribution happens out-of-band (mail connector); plaintext
    // passwords are never logged or returned by the API.
    for (const participant of auction!.participants) {
      const vendorEmail = participant.vendor.email;

      const existing = await prisma.user.findUnique({ where: { email: vendorEmail } });
      if (!existing) {
        const temporaryPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
        await prisma.user.create({
          data: {
            email: vendorEmail,
            password: passwordHash,
            role: Role.VENDOR,
            companyId: auction!.companyId,
          },
        });
        logger.info(`Generated vendor credentials for ${vendorEmail}`);
      }

      await prisma.participant.update({
        where: { id: participant.id },
        data: { invitedAt: new Date() },
      });
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.PUBLISHED, enabled: true },
    });

    await logAuditEvent('PUBLISHED', 'Auction', id, req.user?.id, req.user?.role, {
      invitedCount: auction!.participants.length,
    });

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
    assertCompanyScope(req, auction);

    // Clone base auction properties
    const newAuction = await prisma.auction.create({
      data: {
        title: `${auction!.title} (Copy)`,
        description: auction!.description,
        state: AuctionState.DRAFT,
        companyId: auction!.companyId,
        ownerId: req.user!.id,
      },
    });

    // Clone the full rule configuration (not just pricing factors)
    if (auction!.bidRuleSnapshot) {
      const r = auction!.bidRuleSnapshot;
      await prisma.bidRuleSnapshot.create({
        data: {
          auctionId: newAuction.id,
          conversionRate: r.conversionRate,
          loadingPercent: r.loadingPercent,
          fixedLoading: r.fixedLoading,
          minDecrement: r.minDecrement,
          auctionType: r.auctionType,
          overtimeEnabled: r.overtimeEnabled,
          overtimeWindowMins: r.overtimeWindowMins,
          overtimeExtensionMins: r.overtimeExtensionMins,
          overtimeTriggerRank: r.overtimeTriggerRank,
          maxExtensions: r.maxExtensions,
          rankVisibility: r.rankVisibility,
        },
      });
    }

    // Clone participant list
    if (auction!.participants.length > 0) {
      await prisma.participant.createMany({
        data: auction!.participants.map(p => ({
          auctionId: newAuction.id,
          vendorId: p.vendorId,
        })),
      });
    }

    await logAuditEvent('AUCTION_DUPLICATED', 'Auction', id, req.user?.id, req.user?.role, {
      newAuctionId: newAuction.id,
    });

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
    assertCompanyScope(req, auction);

    if (auction!.state === AuctionState.COMPLETED || auction!.state === AuctionState.CANCELLED) {
      return next(new AppError('This auction has already ended and cannot be cancelled', 400));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.CANCELLED, enabled: false },
    });

    await logAuditEvent('CANCELLED', 'Auction', id, req.user?.id, req.user?.role, { comment });

    const io = getIo(req);
    if (io) {
      io.to(`auction:${id}`).emit('auction.closed', {
        auctionId: id,
        state: AuctionState.CANCELLED,
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

// 13. Submit Bid (Vendor / Surrogate)
//
// Concurrency model: every bid for a given auction is serialized by taking a
// row-level lock (SELECT ... FOR UPDATE) on the Auction row inside a single
// transaction. All validation (state, schedule, decrement rule) and the bid
// insert + overtime extension happen while the lock is held, so two bids
// arriving in the same millisecond can never both pass the decrement check or
// both extend the timer.
export const submitBid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { amount, vendorId } = req.body;

    // Identify participant outside the lock (read-only, cheap).
    let participant;
    if (req.user!.role === 'VENDOR') {
      // Vendors may only bid in the auction their session token is scoped to.
      const tokenAuctionId = (req.user as any).auctionId;
      if (tokenAuctionId && tokenAuctionId !== id) {
        return next(new AppError('Your session is not scoped to this auction', 403, 'FORBIDDEN'));
      }
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

    // In-process per-auction serialization runs BEFORE a connection is taken,
    // so waiting bidders queue cheaply instead of holding an idle DB connection
    // blocked on the row lock. The FOR UPDATE below remains the cross-instance
    // guarantee when multiple app instances run behind a load balancer.
    const result = await bidLock.run(id, () => prisma.$transaction(
      async tx => {
        // Serialize concurrent bids per auction (cross-instance safety net).
        await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${id} FOR UPDATE`;

        const auction = await tx.auction.findUnique({
          where: { id },
          include: { bidRuleSnapshot: true },
        });

        if (!auction) {
          throw new AppError('Auction not found', 404, 'NOT_FOUND');
        }
        if (req.user!.role !== 'SYSTEM_ADMIN' && auction.companyId !== req.user!.companyId) {
          throw new AppError('Auction not found', 404, 'NOT_FOUND');
        }
        if (auction.state !== AuctionState.LIVE && auction.state !== AuctionState.OVERTIME) {
          throw new AppError('This auction is not currently accepting bids', 400, 'NOT_LIVE');
        }
        if (!auction.enabled) {
          throw new AppError('This auction is currently paused by the administrator', 400, 'PAUSED');
        }

        const now = new Date();
        if (auction.endAt && now > auction.endAt) {
          throw new AppError('The auction closed before your bid was received', 400, 'CLOSED');
        }

        // All money math on Decimal, rounded half-up to 2dp — no float drift.
        const rule = auction.bidRuleSnapshot;
        const D = Prisma.Decimal;
        const rate = rule ? new D(rule.conversionRate) : new D(1);
        const loadPercent = rule ? new D(rule.loadingPercent) : new D(0);
        const fixedLoad = rule ? new D(rule.fixedLoading) : new D(0);
        const minStep = rule ? new D(rule.minDecrement) : new D(100);
        const isReverse = rule ? rule.auctionType === 'REVERSE' : true;

        const amountDec = new D(amount).toDecimalPlaces(2);
        const effectiveTotal = amountDec
          .mul(rate)
          .add(fixedLoad)
          .add(amountDec.mul(loadPercent).div(100))
          .toDecimalPlaces(2);

        // Enforce bid step against the current leading bid.
        const leadingBid = await tx.bid.findFirst({
          where: { auctionId: id },
          orderBy: [{ effectiveTotal: isReverse ? 'asc' : 'desc' }, { timestamp: 'asc' }],
        });

        if (leadingBid) {
          const leadingVal = new D(leadingBid.effectiveTotal);
          if (isReverse) {
            const maxAllowed = leadingVal.sub(minStep);
            if (effectiveTotal.greaterThan(maxAllowed)) {
              throw new AppError(
                `Your bid does not meet the minimum required decrement. Maximum allowed effective value is ${maxAllowed.toFixed(2)}`,
                400,
                'INVALID_DECREMENT'
              );
            }
          } else {
            const minAllowed = leadingVal.add(minStep);
            if (effectiveTotal.lessThan(minAllowed)) {
              throw new AppError(
                `Your bid does not meet the minimum required increment. Minimum allowed effective value is ${minAllowed.toFixed(2)}`,
                400,
                'INVALID_INCREMENT'
              );
            }
          }
        }

        // Tamper-evident hash chain (previous bid resolved under the same lock).
        const lastBid = await tx.bid.findFirst({
          where: { auctionId: id },
          orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
        });
        const prevHash = lastBid ? lastBid.hash : 'genesis';
        const timestamp = new Date();
        const hash = crypto
          .createHash('sha256')
          .update(`${id}-${participant!.id}-${effectiveTotal.toFixed(2)}-${timestamp.getTime()}-${prevHash}`)
          .digest('hex');

        const newBid = await tx.bid.create({
          data: {
            amount: amountDec,
            conversionRate: rate,
            loadingPercent: loadPercent,
            fixedLoading: fixedLoad,
            effectiveTotal,
            timestamp,
            auctionId: id,
            participantId: participant!.id,
            submittedAsSurrogate: req.user!.role !== 'VENDOR',
            hash,
            previousHash: lastBid ? lastBid.hash : null,
          },
        });

        // Anti-sniping overtime: extend only within the trigger window, and never
        // beyond the configured maximum number of extensions.
        let isExtended = false;
        let newEnd = auction.endAt;
        let extensionsUsed = auction.extensionCount;

        if (rule && rule.overtimeEnabled && auction.endAt) {
          const remainingMs = auction.endAt.getTime() - timestamp.getTime();
          const triggerWindowMs = rule.overtimeWindowMins * 60 * 1000;
          const capReached = rule.maxExtensions !== null && auction.extensionCount >= rule.maxExtensions;

          if (remainingMs > 0 && remainingMs <= triggerWindowMs && !capReached) {
            newEnd = new Date(auction.endAt.getTime() + rule.overtimeExtensionMins * 60 * 1000);
            extensionsUsed = auction.extensionCount + 1;
            await tx.auction.update({
              where: { id },
              data: { endAt: newEnd, state: AuctionState.OVERTIME, extensionCount: extensionsUsed },
            });
            isExtended = true;
          }
        }

        return { newBid, isExtended, newEnd, extensionsUsed, rule, effectiveTotal };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10000 }
    ));

    const { newBid, isExtended, newEnd, extensionsUsed, rule } = result;

    await logAuditEvent(
      newBid.submittedAsSurrogate ? 'SURROGATE_BID_SUBMITTED' : 'BID_SUBMITTED',
      'Bid',
      newBid.id,
      req.user?.id,
      req.user?.role,
      { auctionId: id, amount: Number(newBid.amount), effectiveTotal: Number(newBid.effectiveTotal), isExtended, newEnd },
      req.ip
    );

    const io = getIo(req);
    if (io) {
      // Anonymized signal to the shared auction room. Clients re-sync their own
      // role-scoped state over REST; competitor identities are never broadcast
      // to vendors.
      io.to(`auction:${id}`).emit('bid.submitted', {
        auctionId: id,
        timestamp: newBid.timestamp,
      });

      if (isExtended && newEnd) {
        io.to(`auction:${id}`).emit('auction.extended', {
          auctionId: id,
          endAt: newEnd,
          extensionMins: rule!.overtimeExtensionMins,
          extensionsUsed,
          maxExtensions: rule!.maxExtensions,
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        id: newBid.id,
        amount: newBid.amount,
        effectiveTotal: newBid.effectiveTotal,
        timestamp: newBid.timestamp,
        isExtended,
        endAt: newEnd,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 14. Get Live Console State (Sync leaderboard & historical lines)
//
// Staff receive the full leaderboard. Vendors receive only their own position,
// their own bid history and the anonymous leading value — competitor identities
// and competitor bid trails are never exposed to vendors.
export const getLiveState = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const isVendor = req.user!.role === 'VENDOR';

    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        bidRuleSnapshot: true,
        participants: {
          include: {
            vendor: { select: { id: true, name: true, email: true } },
            bids: {
              orderBy: [{ effectiveTotal: 'asc' }, { timestamp: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });

    if (!auction) {
      return next(new AppError('Auction not found', 404, 'NOT_FOUND'));
    }
    if (!isVendor && req.user!.role !== 'SYSTEM_ADMIN' && auction.companyId !== req.user!.companyId) {
      return next(new AppError('Auction not found', 404, 'NOT_FOUND'));
    }

    const isReverse = auction.bidRuleSnapshot?.auctionType !== 'FORWARD';

    // Build per-participant best-bid rows. Best bid = lowest effective total for
    // reverse auctions, highest for forward. Ties resolve to the earlier bid.
    const rows = auction.participants.map(p => {
      const best = isReverse
        ? p.bids[0]
        : undefined;
      return { participant: p, best };
    });

    // For forward auctions re-query best bids (highest) in one grouped pass.
    let forwardBest: Record<string, { effectiveTotal: Prisma.Decimal; amount: Prisma.Decimal; timestamp: Date; submittedAsSurrogate: boolean }> = {};
    if (!isReverse) {
      const bids = await prisma.bid.findMany({
        where: { auctionId: id },
        orderBy: [{ effectiveTotal: 'desc' }, { timestamp: 'asc' }],
      });
      for (const b of bids) {
        if (!forwardBest[b.participantId]) forwardBest[b.participantId] = b;
      }
    }

    const rankings = rows.map(({ participant: p, best }) => {
      const lead = isReverse ? best : forwardBest[p.id];
      return {
        vendorId: p.vendorId,
        vendorName: p.vendor.name,
        vendorEmail: p.vendor.email,
        blocked: p.blocked,
        acceptedTerms: p.acceptedTerms,
        currentBid: lead ? Number(lead.amount) : null,
        effectiveTotal: lead ? Number(lead.effectiveTotal) : null,
        lastBidAt: lead ? lead.timestamp : null,
        submittedAsSurrogate: lead ? lead.submittedAsSurrogate : false,
      };
    });

    rankings.sort((a, b) => {
      if (a.effectiveTotal === null && b.effectiveTotal === null) return 0;
      if (a.effectiveTotal === null) return 1;
      if (b.effectiveTotal === null) return -1;
      if (a.effectiveTotal !== b.effectiveTotal) {
        return isReverse ? a.effectiveTotal - b.effectiveTotal : b.effectiveTotal - a.effectiveTotal;
      }
      // Deterministic tie-break: the earlier bid wins the better rank.
      return new Date(a.lastBidAt!).getTime() - new Date(b.lastBidAt!).getTime();
    });

    const leadingEffectiveTotal = rankings.length > 0 ? rankings[0].effectiveTotal : null;

    const base = {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      state: auction.state,
      enabled: auction.enabled,
      startAt: auction.startAt,
      endAt: auction.endAt,
      baseCurrency: auction.baseCurrency,
      extensionCount: auction.extensionCount,
      rules: auction.bidRuleSnapshot,
      serverNow: new Date().toISOString(),
    };

    if (isVendor) {
      // Vendor-scoped view.
      const tokenAuctionId = (req.user as any).auctionId;
      if (tokenAuctionId && tokenAuctionId !== id) {
        return next(new AppError('Your session is not scoped to this auction', 403, 'FORBIDDEN'));
      }
      const mine = auction.participants.find(p => p.vendor.email.toLowerCase() === req.user!.email.toLowerCase());
      if (!mine) {
        return next(new AppError('You are not a participant of this auction', 403, 'NOT_A_PARTICIPANT'));
      }

      const myRankIndex = rankings.findIndex(r => r.vendorId === mine.vendorId);
      const myRow = myRankIndex >= 0 ? rankings[myRankIndex] : null;

      const myBids = await prisma.bid.findMany({
        where: { auctionId: id, participantId: mine.id },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      return res.status(200).json({
        success: true,
        data: {
          ...base,
          leadingEffectiveTotal,
          you: {
            vendorId: mine.vendorId,
            vendorName: mine.vendor.name,
            blocked: mine.blocked,
            acceptedTerms: mine.acceptedTerms,
            rank: myRow && myRow.effectiveTotal !== null ? myRankIndex + 1 : null,
            currentBid: myRow ? myRow.currentBid : null,
            effectiveTotal: myRow ? myRow.effectiveTotal : null,
          },
          myBids: myBids.map(b => ({
            id: b.id,
            amount: Number(b.amount),
            effectiveTotal: Number(b.effectiveTotal),
            timestamp: b.timestamp,
          })),
        },
      });
    }

    // Staff view: full leaderboard + chronological history.
    const bids = await prisma.bid.findMany({
      where: { auctionId: id },
      orderBy: { timestamp: 'desc' },
      take: 300,
      include: {
        participant: { include: { vendor: { select: { name: true } } } },
      },
    });

    const formattedBids = bids.map(b => ({
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
        ...base,
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

    const auction = await prisma.auction.findUnique({ where: { id } });
    assertCompanyScope(req, auction);

    if (!auction!.endAt) {
      return next(new AppError('Auction close time not found', 400));
    }
    if (auction!.state !== AuctionState.LIVE && auction!.state !== AuctionState.OVERTIME) {
      return next(new AppError('Only a live auction can be extended', 400, 'NOT_LIVE'));
    }

    const newEnd = new Date(auction!.endAt.getTime() + Number(durationMinutes) * 60 * 1000);
    const updated = await prisma.auction.update({
      where: { id },
      data: { endAt: newEnd, state: AuctionState.OVERTIME },
    });

    await logAuditEvent('MANUAL_EXTEND', 'Auction', id, req.user?.id, req.user?.role, { durationMinutes, newEnd });

    const io = getIo(req);
    if (io) {
      io.to(`auction:${id}`).emit('auction.extended', {
        auctionId: id,
        endAt: newEnd,
        extensionMins: durationMinutes,
        manual: true,
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
    assertCompanyScope(req, auction);

    if (auction!.state === AuctionState.COMPLETED || auction!.state === AuctionState.CANCELLED) {
      return next(new AppError('This auction has already ended', 400));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { state: AuctionState.COMPLETED, enabled: false },
    });

    await logAuditEvent('MANUAL_STOP', 'Auction', id, req.user?.id, req.user?.role);

    const io = getIo(req);
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
    assertCompanyScope(req, auction);

    const updated = await prisma.auction.update({
      where: { id },
      data: { enabled: false },
    });

    await logAuditEvent('MANUAL_PAUSE', 'Auction', id, req.user?.id, req.user?.role);

    const io = getIo(req);
    if (io) {
      io.to(`auction:${id}`).emit('auction.state.changed', {
        auctionId: id,
        state: updated.state,
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
    assertCompanyScope(req, auction);

    if (auction!.state === AuctionState.COMPLETED || auction!.state === AuctionState.CANCELLED) {
      return next(new AppError('An ended auction cannot be resumed', 400));
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: { enabled: true },
    });

    await logAuditEvent('MANUAL_RESUME', 'Auction', id, req.user?.id, req.user?.role);

    const io = getIo(req);
    if (io) {
      io.to(`auction:${id}`).emit('auction.state.changed', {
        auctionId: id,
        state: updated.state,
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

    const auction = await prisma.auction.findUnique({ where: { id } });
    assertCompanyScope(req, auction);

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

    await logAuditEvent('VENDOR_BLOCKED', 'AuctionParticipant', participant.id, req.user?.id, req.user?.role, {
      vendorName: participant.vendor.name,
    });

    const io = getIo(req);
    if (io) {
      io.to(`auction:${id}:vendor:${participant.vendor.id}`).emit('participant.blocked', {
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

    const auction = await prisma.auction.findUnique({ where: { id } });
    assertCompanyScope(req, auction);

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

    await logAuditEvent('VENDOR_UNBLOCKED', 'AuctionParticipant', participant.id, req.user?.id, req.user?.role, {
      vendorName: participant.vendor.name,
    });

    const io = getIo(req);
    if (io) {
      io.to(`auction:${id}:vendor:${participant.vendor.id}`).emit('participant.blocked', {
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

    const participant = await prisma.participant.findFirst({
      where: {
        auctionId: id,
        vendor: { email: req.user!.email },
      },
      include: { vendor: true, auction: { select: { companyId: true } } },
    });

    if (!participant) {
      return next(new AppError('Vendor participant record not found', 404));
    }
    if (participant.blocked) {
      return next(new AppError('Your access to this auction has been restricted', 403, 'BLOCKED'));
    }

    // Idempotent: re-accepting must not duplicate acceptance records.
    if (participant.acceptedTerms) {
      return res.status(200).json({
        success: true,
        message: 'Compliance terms already accepted',
      });
    }

    await prisma.participant.update({
      where: { id: participant.id },
      data: { acceptedTerms: true },
    });

    // Record acceptance against the latest version of each template type,
    // scoped to the auction's owning company. The client-reported IP is never
    // trusted; only the connection IP is stored.
    const docs = await prisma.documentTemplate.findMany({
      where: { companyId: participant.auction.companyId },
      orderBy: { version: 'desc' },
    });

    const latestDocs: Record<string, (typeof docs)[number]> = {};
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
          ipAddress: req.ip || null,
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
      req.ip
    );

    return res.status(200).json({
      success: true,
      message: 'Compliance terms successfully accepted and logged',
    });
  } catch (error) {
    next(error);
  }
};

// 22. Vendor Action: Read Compliance Documents for gateway display
export const getAuctionTerms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Resolve the auction's owning company; templates are read strictly within it.
    const auction = await prisma.auction.findUnique({ where: { id }, select: { companyId: true } });
    if (!auction) {
      return next(new AppError('Auction not found', 404, 'NOT_FOUND'));
    }

    if (req.user!.role === 'VENDOR') {
      const participant = await prisma.participant.findFirst({
        where: { auctionId: id, vendor: { email: req.user!.email } },
        select: { id: true },
      });
      if (!participant) {
        return next(new AppError('You are not a participant of this auction', 403, 'NOT_A_PARTICIPANT'));
      }
    } else {
      assertCompanyScope(req, auction);
    }

    const docs = await prisma.documentTemplate.findMany({
      where: { companyId: auction.companyId },
      orderBy: { version: 'desc' },
    });

    const latest: Record<string, { id: string; type: string; version: number; content: string }> = {};
    for (const doc of docs) {
      if (!latest[doc.type]) {
        latest[doc.type] = { id: doc.id, type: doc.type, version: doc.version, content: doc.content };
      }
    }

    return res.status(200).json({
      success: true,
      data: Object.values(latest),
    });
  } catch (error) {
    next(error);
  }
};
