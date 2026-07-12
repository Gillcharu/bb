import { Router } from 'express';
import {
  listAuctions,
  getAuctionDetails,
  getPublicAuctionDetails,
  createAuction,
  updateAuction,
  submitForApproval,
  approveAuction,
  rejectAuction,
  validatePublish,
  publishAuction,
  duplicateAuction,
  cancelAuction,
  submitBid,
  getLiveState,
  getAuctionTerms,
  extendAuction,
  stopAuction,
  pauseAuction,
  resumeAuction,
  blockVendor,
  unblockVendor,
  acceptTerms,
} from '../controllers/auctions';
import { authenticateJWT, requireRoles } from '../middleware/auth';
import { publicRateLimiter, authedRateLimiter, bidRateLimiter } from '../middleware/rateLimiter';
import {
  validateRequest,
  submitBidSchema,
  createAuctionSchema,
  updateAuctionSchema,
  rejectAuctionSchema,
  cancelAuctionSchema,
  extendAuctionSchema,
} from '../middleware/validate';

const router = Router();

// Public route for checking invitation context badge
router.get('/public/:id', publicRateLimiter, getPublicAuctionDetails);

// Protect all other routes with JWT & apply authed actions rate limiter
router.use(authenticateJWT);
router.use(authedRateLimiter);

// Shared/Internal read
router.get('/', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER']), listAuctions);
router.get('/:id', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER']), getAuctionDetails);

// Operational creation & configuration
router.post('/', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(createAuctionSchema), createAuction);
router.patch('/:id', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(updateAuctionSchema), updateAuction);
router.post('/:id/submit-for-approval', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), submitForApproval);
router.post('/:id/duplicate', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), duplicateAuction);
router.post('/:id/cancel', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(cancelAuctionSchema), cancelAuction);

// Validation and Publishing
router.get('/:id/validate-publish', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validatePublish);
router.post('/:id/publish', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), publishAuction);

// Approver Actions
router.post('/:id/approve', requireRoles(['SYSTEM_ADMIN', 'APPROVER']), approveAuction);
router.post('/:id/reject', requireRoles(['SYSTEM_ADMIN', 'APPROVER']), validateRequest(rejectAuctionSchema), rejectAuction);

// Live bidding & operational console overrides
router.post('/:id/bids', requireRoles(['SYSTEM_ADMIN', 'VENDOR']), bidRateLimiter, validateRequest(submitBidSchema), submitBid);
router.get('/:id/terms', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER', 'VENDOR']), getAuctionTerms);
router.post('/:id/terms/accept', requireRoles(['SYSTEM_ADMIN', 'VENDOR']), acceptTerms);
router.get('/:id/live-state', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER', 'VENDOR']), getLiveState);
router.post('/:id/extend', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(extendAuctionSchema), extendAuction);
router.post('/:id/stop', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), stopAuction);
router.post('/:id/pause', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), pauseAuction);
router.post('/:id/resume', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), resumeAuction);
router.post('/:id/participants/:vendorId/block', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), blockVendor);
router.post('/:id/participants/:vendorId/unblock', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), unblockVendor);

export default router;
