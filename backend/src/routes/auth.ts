import { Router } from 'express';
import { login, refresh, getMe, vendorLogin, logout } from '../controllers/auth';
import { authenticateJWT } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { validateRequest, loginSchema, vendorLoginSchema } from '../middleware/validate';

const router = Router();

router.post('/login', authRateLimiter, validateRequest(loginSchema), login);
router.post('/vendor-login', authRateLimiter, validateRequest(vendorLoginSchema), vendorLogin);
router.post('/refresh', authRateLimiter, refresh);
router.post('/logout', authenticateJWT, logout);
router.get('/me', authenticateJWT, getMe);

export default router;
