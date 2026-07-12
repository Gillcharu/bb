import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandlers';

export interface AuthPayload {
  id: string;
  email: string;
  role: 'SYSTEM_ADMIN' | 'AUCTION_OWNER' | 'APPROVER' | 'OBSERVER' | 'VENDOR';
  companyId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

import { prisma } from '../config/db';
import { env } from '../config/env';

const JWT_SECRET = env.jwtSecret;

export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new AppError('No token provided', 401, 'UNAUTHORIZED'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new AppError('Token format invalid', 401, 'UNAUTHORIZED'));
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload & { auctionId?: string };
    
    // If user is a VENDOR and has a designated auctionId, check if auction is completed
    if (decoded.role === 'VENDOR' && decoded.auctionId) {
      const auction = await prisma.auction.findUnique({
        where: { id: decoded.auctionId }
      });
      if (auction && auction.state === 'COMPLETED') {
        return next(new AppError('Vendor session expired: The auction has completed.', 401, 'VENDOR_SESSION_EXPIRED'));
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token has expired', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('Token verification failed', 401, 'UNAUTHORIZED'));
  }
};

export const requireRoles = (allowedRoles: ('SYSTEM_ADMIN' | 'AUCTION_OWNER' | 'APPROVER' | 'OBSERVER' | 'VENDOR')[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Forbidden: Insufficient permissions', 403, 'FORBIDDEN'));
    }

    next();
  };
};
