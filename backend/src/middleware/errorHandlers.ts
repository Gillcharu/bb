import { Request, Response, NextFunction } from 'express';
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
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  if (statusCode === 500) {
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

  // Prevent information leakage on internal 500 errors (hide stacks and SQL syntax)
  const clientMessage = statusCode === 500 
    ? 'An unexpected error occurred. Please contact system support.' 
    : err.message || 'Client request validation error';

  res.status(statusCode).json({
    success: false,
    error: {
      message: clientMessage,
      code,
      details: statusCode === 500 ? undefined : (err.details || undefined)
    }
  });
};
