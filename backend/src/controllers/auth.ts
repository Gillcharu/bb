import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandlers';
import { logger } from '../utils/logger';

import { env } from '../config/env';

const JWT_SECRET = env.jwtSecret;
const JWT_REFRESH_SECRET = env.jwtRefreshSecret;

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Email and password are required', 400));
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user || user.role === 'VENDOR') {
      // Security rule: generic error message to prevent account enumeration.
      // Vendors must use the dedicated per-auction vendor login flow.
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }

    // Sign Access Token
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Sign Refresh Token
    const refreshToken = jwt.sign(
      {
        id: user.id,
      },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    logger.info(`User logged in successfully: ${user.email} (${user.role})`);

    // Audit Log
    await prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: user.id,
        action: 'USER_LOGIN',
        actorId: user.id,
        actorRole: user.role,
        ipAddress: req.ip,
        payload: { email: user.email },
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          company: {
            id: user.company.id,
            name: user.company.name,
            primaryColor: user.company.primaryColor,
            accentColor: user.company.accentColor,
            logoUrl: user.company.logoUrl,
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new AppError('Refresh token is required', 400));
    }

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return next(new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN'));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { company: true },
    });

    if (!user) {
      return next(new AppError('User not found', 401, 'USER_NOT_FOUND'));
    }

    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { company: true },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        company: {
          id: user.company.id,
          name: user.company.name,
          primaryColor: user.company.primaryColor,
          accentColor: user.company.accentColor,
          logoUrl: user.company.logoUrl,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const vendorLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, auctionId } = req.body;

    if (!email || !password) {
      return next(new AppError('Username and password are required', 400));
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user || user.role !== 'VENDOR') {
      return next(new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS'));
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return next(new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS'));
    }

    // Authorization: the vendor must actually be an invited, unblocked participant
    // of the requested auction. Without this check, any vendor could mint a token
    // scoped to an arbitrary auction and receive its live bid broadcasts.
    if (auctionId) {
      const participant = await prisma.participant.findFirst({
        where: {
          auctionId,
          vendor: { email: user.email },
        },
        include: { auction: { select: { state: true } } },
      });

      if (!participant) {
        return next(new AppError('You are not an invited participant of this auction', 403, 'NOT_A_PARTICIPANT'));
      }
      if (participant.blocked) {
        return next(new AppError('Your access to this auction has been restricted', 403, 'BLOCKED'));
      }
      if (participant.auction.state === 'COMPLETED' || participant.auction.state === 'CANCELLED') {
        return next(new AppError('This bidding session has ended. Credentials are no longer valid.', 401, 'VENDOR_SESSION_EXPIRED'));
      }
    }

    // Sign Access Token containing VENDOR role and the target auctionId
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        auctionId: auctionId || undefined,
      },
      JWT_SECRET,
      { expiresIn: '2h' } // Short duration session for active bidding
    );

    logger.info(`Vendor logged in successfully: ${user.email} (Auction ID: ${auctionId || 'none'})`);

    // Audit Log
    await prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: user.id,
        action: 'VENDOR_LOGIN',
        actorId: user.id,
        actorRole: user.role,
        ipAddress: req.ip,
        payload: { email: user.email, auctionId },
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          company: {
            id: user.company.id,
            name: user.company.name,
            primaryColor: user.company.primaryColor,
            accentColor: user.company.accentColor,
            logoUrl: user.company.logoUrl,
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
