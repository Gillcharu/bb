process.env.JWT_SECRET = 'supersecretjwtkeyforblackboxauctionhub2026!';
process.env.JWT_REFRESH_SECRET = 'supersecretjwtrefreshkeyforblackboxauctionhub2026!';

import request from 'supertest';
import express, { json } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authRouter from '../src/routes/auth';
import { errorHandler } from '../src/middleware/errorHandlers';
import { authenticateJWT, requireRoles } from '../src/middleware/auth';

// Mock Prisma
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
jest.mock('../src/config/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
    },
    auditLog: {
      create: (...args: any[]) => mockCreate(...args),
    },
  },
}));

const app = express();
app.use(json());
app.use('/api/auth', authRouter);

// Test RBAC protected endpoint
app.get('/api/test-admin', authenticateJWT, requireRoles(['SYSTEM_ADMIN']), (req, res) => {
  res.status(200).json({ success: true, message: 'Welcome Admin' });
});

app.use(errorHandler);

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkeyforblackboxauctionhub2026!';

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should successfully authenticate and return tokens', async () => {
      const mockPassword = 'Password123!';
      const hashedPassword = await bcrypt.hash(mockPassword, 10);
      const mockUser = {
        id: 'user-id-123',
        email: 'admin@blackboxlimited.com',
        password: hashedPassword,
        role: 'SYSTEM_ADMIN',
        companyId: 'company-id-123',
        company: {
          id: 'company-id-123',
          name: 'Black Box',
          primaryColor: '#0B2447',
          accentColor: '#1B5A9E',
          logoUrl: '/logo.png',
        },
      };

      mockFindUnique.mockResolvedValue(mockUser);
      mockCreate.mockResolvedValue({ id: 'audit-log-id' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@blackboxlimited.com', password: mockPassword });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe(mockUser.email);
      expect(response.body.data.user.role).toBe(mockUser.role);
    });

    it('should reject invalid credentials', async () => {
      const mockUser = {
        id: 'user-id-123',
        email: 'admin@blackboxlimited.com',
        password: 'hashedpassword',
        role: 'SYSTEM_ADMIN',
        companyId: 'company-id-123',
      };

      mockFindUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@blackboxlimited.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid email or password');
    });
  });

  describe('RBAC Middleware Enforcement', () => {
    it('should allow access for valid role', async () => {
      const token = jwt.sign(
        {
          id: 'user-id-123',
          email: 'admin@blackboxlimited.com',
          role: 'SYSTEM_ADMIN',
          companyId: 'company-id-123',
        },
        JWT_SECRET
      );

      const response = await request(app)
        .get('/api/test-admin')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Welcome Admin');
    });

    it('should block access for invalid role', async () => {
      const token = jwt.sign(
        {
          id: 'user-id-123',
          email: 'vendor@supplier.com',
          role: 'VENDOR',
          companyId: 'company-id-123',
        },
        JWT_SECRET
      );

      const response = await request(app)
        .get('/api/test-admin')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject requests without a token', async () => {
      const response = await request(app).get('/api/test-admin');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
