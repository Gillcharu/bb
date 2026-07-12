import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number = 400, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Map known Prisma errors to safe, generic client responses. The Prisma `meta`
// object can contain table/column names, so it is never forwarded — only a
// clean status code and human message are returned.
const normalizePrismaError = (err: unknown): { statusCode: number; code: string; message: string } | null => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return { statusCode: 409, code: 'CONFLICT', message: 'A record with these details already exists.' };
      case 'P2025':
        return { statusCode: 404, code: 'NOT_FOUND', message: 'The requested record was not found.' };
      case 'P2003':
        return { statusCode: 400, code: 'INVALID_REFERENCE', message: 'A referenced record does not exist.' };
      default:
        return { statusCode: 400, code: 'DATABASE_REQUEST_ERROR', message: 'The request could not be processed.' };
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, code: 'VALIDATION_FAILED', message: 'The request contained invalid data.' };
  }
  return null;
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND'
    }
  });
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Translate raw Prisma errors into safe client responses first.
  const prismaMapped = normalizePrismaError(err);

  const statusCode = prismaMapped?.statusCode ?? err.statusCode ?? 500;
  const code = prismaMapped?.code ?? (err instanceof AppError ? err.code : undefined) ?? (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

  if (statusCode >= 500) {
    logger.error('Unhandled Server Error:', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.warn(`Client Error (${statusCode}): ${err.message || 'Validation Failed'}`, {
      path: req.originalUrl,
      method: req.method,
    });
  }

  // Never leak internal details (stack traces, SQL, Prisma meta) to the client.
  // For 500s use a fixed generic message; otherwise use the mapped/AppError message.
  const clientMessage =
    statusCode >= 500
      ? 'An unexpected error occurred. Please contact system support.'
      : prismaMapped?.message ?? (err instanceof AppError ? err.message : 'The request could not be processed.');

  res.status(statusCode).json({
    success: false,
    error: {
      message: clientMessage,
      code,
      details: statusCode >= 500 || prismaMapped ? undefined : err.details || undefined,
    },
  });
};
