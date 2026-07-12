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
        return next(new AppError(`Validation failed: ${errorDetails}`, 400, 'VALIDATION_FAILED'));
      }
      return next(error);
    }
  };
};

const uuidParam = z.object({
  id: z.string().uuid('Invalid auction ID'),
});

// 1. Authentication schemas
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').max(100),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  }),
});

export const vendorLoginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').max(100),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    auctionId: z.string().uuid('Invalid Auction ID format').optional().nullable(),
  }),
});

// 2. Bid Submission schema
// The server is the single source of truth for conversion, loading and effective
// totals; clients may only submit the raw bid amount (plus a target vendor for
// surrogate bids placed by staff).
export const submitBidSchema = z.object({
  body: z.object({
    amount: z
      .number({ invalid_type_error: 'Bid amount must be a number' })
      .positive('Bid amount must be a positive number')
      .max(9_999_999_999, 'Bid amount exceeds the supported maximum'),
    vendorId: z.string().uuid('Invalid vendor ID').optional(),
  }),
  params: uuidParam,
});

// 3. User Invitation schema
export const inviteUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format').max(100),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    role: z.enum(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER', 'VENDOR']),
  }),
});

// 4. Create Vendor schema
export const createVendorSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Vendor name is required').max(100),
    email: z.string().email('Invalid email format').max(100),
  }),
});

// 5. Auction creation / update schemas
export const createAuctionSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
    description: z.string().max(2000).optional().nullable(),
  }),
});

const isoDate = z
  .string()
  .refine(v => !Number.isNaN(Date.parse(v)), 'Invalid date value');

export const updateAuctionSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(150).optional(),
      description: z.string().max(2000).optional().nullable(),
      startAt: isoDate.optional().nullable(),
      endAt: isoDate.optional().nullable(),
      approverId: z.string().uuid().optional().nullable(),
      baseCurrency: z.string().trim().length(3, 'Currency must be a 3-letter code').optional(),
      state: z
        .enum([
          'DRAFT',
          'PENDING_APPROVAL',
          'APPROVED',
          'PUBLISH_VALIDATION',
          'PUBLISHED',
          'ENABLED',
          'LIVE',
          'OVERTIME',
          'COMPLETED',
          'REJECTED',
          'CANCELLED',
          'DISABLED',
        ])
        .optional(),
      conversionRate: z.number().positive().max(100000).optional(),
      loadingPercent: z.number().min(0).max(100).optional(),
      fixedLoading: z.number().min(0).max(9_999_999_999).optional(),
      minDecrement: z.number().positive().max(9_999_999_999).optional(),
      auctionType: z.enum(['REVERSE', 'FORWARD']).optional(),
      overtimeEnabled: z.boolean().optional(),
      overtimeWindowMins: z.number().int().min(1).max(120).optional(),
      overtimeExtensionMins: z.number().int().min(1).max(120).optional(),
      overtimeTriggerRank: z.string().max(20).optional(),
      maxExtensions: z.number().int().min(1).max(100).optional().nullable(),
      rankVisibility: z.enum(['OWN_RANK_ONLY', 'FULL_LEADERBOARD']).optional(),
      participantVendorIds: z.array(z.string().uuid()).max(2000).optional(),
    })
    .refine(
      body => {
        if (body.startAt && body.endAt) {
          return new Date(body.endAt).getTime() > new Date(body.startAt).getTime();
        }
        return true;
      },
      { message: 'endAt must be after startAt', path: ['endAt'] }
    ),
  params: uuidParam,
});

// 6. Misc action schemas
export const rejectAuctionSchema = z.object({
  body: z.object({
    comment: z.string().trim().min(10, 'A reject comment of at least 10 characters is required').max(1000),
  }),
  params: uuidParam,
});

export const cancelAuctionSchema = z.object({
  body: z.object({
    comment: z.string().trim().max(1000).optional(),
  }),
  params: uuidParam,
});

export const extendAuctionSchema = z.object({
  body: z.object({
    durationMinutes: z.number().int().positive().max(24 * 60),
  }),
  params: uuidParam,
});

export const createTemplateSchema = z.object({
  body: z.object({
    type: z.enum(['TERMS', 'DISCLOSURE', 'RULES']),
    content: z.string().trim().min(1, 'Template content is required').max(50000),
  }),
});

export const updateCompanySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(150).optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #0B2447')
      .optional()
      .nullable(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #1B5A9E')
      .optional()
      .nullable(),
  }),
});

export const smtpTestSchema = z.object({
  body: z.object({
    host: z
      .string()
      .trim()
      .min(1, 'SMTP host is required')
      .max(255)
      .regex(/^[a-zA-Z0-9.-]+$/, 'Invalid host name'),
    port: z.coerce.number().int().min(1).max(65535),
    username: z.string().max(255).optional(),
    password: z.string().max(255).optional(),
  }),
});
