import { Router } from 'express';
import authRoutes from './auth';
import auctionsRoutes from './auctions';
import settingsRoutes from './settings';
import auditLogRoutes from './auditLog';
import reportsRoutes from './reports';

const router = Router();

router.use('/auth', authRoutes);
router.use('/auctions', auctionsRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/reports', reportsRoutes);

export default router;
