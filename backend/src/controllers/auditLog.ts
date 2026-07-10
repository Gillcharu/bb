import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';

export const listAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, actorId, search } = req.query;

    const whereClause: any = {};

    if (action) {
      whereClause.action = action as string;
    }

    if (actorId) {
      whereClause.actorId = actorId as string;
    }

    if (search) {
      whereClause.OR = [
        { entity: { contains: search as string, mode: 'insensitive' } },
        { action: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100, // safety cap limit
    });

    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};
