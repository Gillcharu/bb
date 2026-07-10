import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditLog';
import { authenticateJWT, requireRoles } from '../middleware/auth';
import { authedRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateJWT);
router.use(authedRateLimiter);

router.get('/', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), listAuditLogs);

export default router;
