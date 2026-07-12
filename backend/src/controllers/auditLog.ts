import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';

export const listAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, actorId, search } = req.query;

    const whereClause: Prisma.AuditLogWhereInput = {};

    if (action && typeof action === 'string') {
      whereClause.action = action;
    }

    if (actorId && typeof actorId === 'string') {
      whereClause.actorId = actorId;
    }

    if (search && typeof search === 'string') {
      whereClause.OR = [
        { entity: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Company scoping: non-admin staff only see events produced by their own
    // company's users or affecting their own company's auctions.
    if (req.user!.role !== 'SYSTEM_ADMIN') {
      const [companyUsers, companyAuctions] = await Promise.all([
        prisma.user.findMany({ where: { companyId: req.user!.companyId }, select: { id: true } }),
        prisma.auction.findMany({ where: { companyId: req.user!.companyId }, select: { id: true } }),
      ]);
      whereClause.AND = [
        {
          OR: [
            { actorId: { in: companyUsers.map(u => u.id) } },
            { entityId: { in: companyAuctions.map(a => a.id) } },
          ],
        },
      ];
    }

    // Pagination (bounded page size)
    const page = Math.max(1, parseInt(String(req.query.page || '1')) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100')) || 100));

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      meta: { page, pageSize, total },
    });
  } catch (error) {
    next(error);
  }
};
