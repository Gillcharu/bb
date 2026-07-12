import { Router } from 'express';
import {
  listUsers,
  inviteUser,
  getCompanySettings,
  updateCompanySettings,
  listVendors,
  createVendor,
  listTemplates,
  createTemplate,
  testSMTPConfig,
} from '../controllers/settings';
import { authenticateJWT, requireRoles } from '../middleware/auth';
import { authedRateLimiter } from '../middleware/rateLimiter';
import {
  validateRequest,
  inviteUserSchema,
  createVendorSchema,
  createTemplateSchema,
  updateCompanySchema,
  smtpTestSchema,
} from '../middleware/validate';

const router = Router();

router.use(authenticateJWT);
router.use(authedRateLimiter);

// Users settings
router.get('/users', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), listUsers);
router.post('/users', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(inviteUserSchema), inviteUser);

// Company preferences settings
router.get('/company', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), getCompanySettings);
router.patch('/company', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(updateCompanySchema), updateCompanySettings);

// Vendor Master index
router.get('/vendors', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), listVendors);
router.post('/vendors', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(createVendorSchema), createVendor);

// compliance Document Templates
router.get('/templates', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), listTemplates);
router.post('/templates', requireRoles(['SYSTEM_ADMIN', 'AUCTION_OWNER']), validateRequest(createTemplateSchema), createTemplate);

// SMTP connector test trigger
router.post('/smtp/test', requireRoles(['SYSTEM_ADMIN']), validateRequest(smtpTestSchema), testSMTPConfig);

export default router;
