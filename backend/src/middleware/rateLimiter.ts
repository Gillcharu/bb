import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandlers';
import { logger } from '../utils/logger';

// 1. Configurable limits loaded from environment variables
const AUTH_IP_MAX = parseInt(process.env.AUTH_IP_MAX || '15');
const AUTH_IP_WINDOW_MS = parseInt(process.env.AUTH_IP_WINDOW_MS || '60000'); // 1 minute

const AUTH_ACCOUNT_MAX_BEFORE_DELAY = parseInt(process.env.AUTH_ACCOUNT_MAX_BEFORE_DELAY || '3');
const AUTH_ACCOUNT_WINDOW_MS = parseInt(process.env.AUTH_ACCOUNT_WINDOW_MS || '900000'); // 15 mins

const PUBLIC_MAX = parseInt(process.env.PUBLIC_MAX || '45');
const PUBLIC_MAX_WINDOW_MS = parseInt(process.env.PUBLIC_MAX_WINDOW_MS || '60000'); // 1 minute

const AUTHED_MAX = parseInt(process.env.AUTHED_MAX || '150');
const AUTHED_MAX_WINDOW_MS = parseInt(process.env.AUTHED_MAX_WINDOW_MS || '60000'); // 1 minute

// 2. In-memory storage structures for rate limiting
interface IpRate {
  count: number;
  firstRequest: number;
}
const ipStores: { [ip: string]: IpRate } = {};

interface AccountFailure {
  attempts: number;
  lastAttempt: number;
}
const accountFailuresStore: { [email: string]: AccountFailure } = {};

// Clean stores periodically to prevent memory leaks
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    for (const ip in ipStores) {
      if (now - ipStores[ip].firstRequest > 15 * 60 * 1000) {
        delete ipStores[ip];
      }
    }
    for (const email in accountFailuresStore) {
      if (now - accountFailuresStore[email].lastAttempt > AUTH_ACCOUNT_WINDOW_MS) {
        delete accountFailuresStore[email];
      }
    }
  }, 10 * 60 * 1000);
}

// Helper to track and enforce IP rate limits
const enforceIpLimit = (ip: string, maxRequests: number, windowMs: number): boolean => {
  const now = Date.now();
  const record = ipStores[ip] || { count: 0, firstRequest: now };

  if (now - record.firstRequest > windowMs) {
    record.count = 1;
    record.firstRequest = now;
  } else {
    record.count += 1;
  }

  ipStores[ip] = record;
  return record.count <= maxRequests;
};

// Rate limiting middleware router
export const authRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';

  // 1. Enforce strict IP limit on authentication endpoints
  if (!enforceIpLimit(ip, AUTH_IP_MAX, AUTH_IP_WINDOW_MS)) {
    return next(new AppError('Too many authentication attempts from this IP. Please try again later.', 429, 'TOO_MANY_REQUESTS'));
  }

  // 2. Enforce per-account login failure exponential backoff
  const email = req.body.email;
  if (email && typeof email === 'string') {
    const record = accountFailuresStore[email];
    const now = Date.now();

    // Catch failed attempts hook to increment account counter
    const originalJson = res.json;
    res.json = function (body: any) {
      if (res.statusCode === 401) {
        const currentRecord = accountFailuresStore[email] || { attempts: 0, lastAttempt: now };
        if (now - currentRecord.lastAttempt > AUTH_ACCOUNT_WINDOW_MS) {
          currentRecord.attempts = 1;
        } else {
          currentRecord.attempts += 1;
        }
        currentRecord.lastAttempt = Date.now();
        accountFailuresStore[email] = currentRecord;
        logger.warn(`Failed login attempt #${currentRecord.attempts} for account: ${email}`);
      } else if (res.statusCode === 200) {
        // Clear failures on successful authentication
        delete accountFailuresStore[email];
      }
      return originalJson.apply(this, arguments as any);
    };

    // Calculate delay if failures exceed safety window
    if (record && now - record.lastAttempt < AUTH_ACCOUNT_WINDOW_MS) {
      if (record.attempts >= AUTH_ACCOUNT_MAX_BEFORE_DELAY) {
        const delay = Math.min(1000 * Math.pow(2, record.attempts - AUTH_ACCOUNT_MAX_BEFORE_DELAY), 15000);
        logger.warn(`Applying backoff delay of ${delay}ms to login request for: ${email}`);
        return setTimeout(next, delay);
      }
    }
  }

  return next();
};

export const publicRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  if (!enforceIpLimit(ip, PUBLIC_MAX, PUBLIC_MAX_WINDOW_MS)) {
    return next(new AppError('Too many requests. Please try again later.', 429, 'TOO_MANY_REQUESTS'));
  }
  return next();
};

export const authedRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  if (!enforceIpLimit(ip, AUTHED_MAX, AUTHED_MAX_WINDOW_MS)) {
    return next(new AppError('Too many actions. Please try again later.', 429, 'TOO_MANY_REQUESTS'));
  }
  return next();
};

// Per-user bid throttle: prevents bid-flooding a live auction from a single
// account. Keyed by authenticated user id, not IP, so vendors behind a shared
// corporate NAT are not unfairly throttled.
const BID_MAX = parseInt(process.env.BID_MAX || '10');
const BID_WINDOW_MS = parseInt(process.env.BID_WINDOW_MS || '10000'); // 10 seconds

interface BidRate {
  count: number;
  windowStart: number;
}
const bidStores: { [userId: string]: BidRate } = {};

if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    for (const key in bidStores) {
      if (now - bidStores[key].windowStart > BID_WINDOW_MS * 6) {
        delete bidStores[key];
      }
    }
  }, 60 * 1000);
}

export const bidRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const key = req.user?.id || req.ip || 'unknown';
  const now = Date.now();
  const record = bidStores[key] || { count: 0, windowStart: now };

  if (now - record.windowStart > BID_WINDOW_MS) {
    record.count = 1;
    record.windowStart = now;
  } else {
    record.count += 1;
  }
  bidStores[key] = record;

  if (record.count > BID_MAX) {
    return next(new AppError('You are submitting bids too quickly. Please wait a moment.', 429, 'TOO_MANY_REQUESTS'));
  }
  return next();
};
