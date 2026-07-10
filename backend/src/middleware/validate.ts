import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from './errorHandlers';

// Request validation wrapper
export const validateRequest = (schema: z.AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        return next(new AppError(`Validation failed: ${errorDetails}`, 400));
      }
      return next(error);
    }
  };
};

// 1. Authentication schemas
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').max(100),
    password: z.string().min(6, 'Password must be at least 6 characters').max(50),
  }),
});

export const vendorLoginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').max(100),
    password: z.string().min(6, 'Password must be at least 6 characters').max(50),
    auctionId: z.string().uuid('Invalid Auction ID format').optional().nullable(),
  }),
});

// 2. Bid Submission schema
export const submitBidSchema = z.object({
  body: z.object({
    amount: z.number().positive('Bid amount must be a positive number'),
    conversionRate: z.number().positive('Conversion rate must be positive'),
    loadingPercent: z.number().nonnegative('Loading percentage cannot be negative'),
    fixedLoading: z.number().nonnegative('Fixed loading cannot be negative'),
    effectiveTotal: z.number().positive('Effective total must be positive'),
    hash: z.string().min(1).max(200),
  }),
  params: z.object({
    id: z.string().uuid('Invalid Auction ID path parameter'),
  }),
});

// 3. User Invitation schema
export const inviteUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').max(100),
    role: z.enum(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER', 'VENDOR']),
  }),
});

// 4. Create Vendor schema
export const createVendorSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Vendor name is required').max(100),
    email: z.string().email('Invalid email format').max(100),
  }),
});
