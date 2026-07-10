import { Router } from 'express';
import { getAuctionReport } from '../controllers/reports';
import { authenticateJWT, requireRoles } from '../middleware/auth';
import { authedRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateJWT);
router.use(authedRateLimiter);

router.get('/auctions/:id', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER']), getAuctionReport);

export default router;
