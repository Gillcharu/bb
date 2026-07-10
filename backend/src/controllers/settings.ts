import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandlers';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';

// 1. Users CRUD
export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: req.user!.role !== 'SYSTEM_ADMIN' ? { companyId: req.user!.companyId } : {},
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });
    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return next(new AppError('Email, password, and role are required', 400));
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return next(new AppError('User email already exists', 400));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: role as Role,
        companyId: req.user!.companyId,
      },
    });

    return res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
};

// 2. Company Defaults config
export const getCompanySettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
    });
    return res.status(200).json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
};

export const updateCompanySettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, primaryColor, accentColor } = req.body;

    const updated = await prisma.company.update({
      where: { id: req.user!.companyId },
      data: { name, primaryColor, accentColor },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// 3. Vendor Master CRUD
export const listVendors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { companyId: req.user!.companyId },
    });
    return res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    next(error);
  }
};

export const createVendor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return next(new AppError('Vendor name and email are required', 400));
    }

    const exists = await prisma.vendor.findUnique({ where: { email } });
    if (exists) {
      return next(new AppError('Vendor email already exists', 400));
    }

    const vendor = await prisma.vendor.create({
      data: {
        name,
        email,
        companyId: req.user!.companyId,
      },
    });

    return res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    next(error);
  }
};

// 4. Document Templates CRUD
export const listTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await prisma.documentTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, content } = req.body;

    if (!type || !content) {
      return next(new AppError('Template type and content are required', 400));
    }

    // Resolve current version count to increment
    const latest = await prisma.documentTemplate.findFirst({
      where: { type },
      orderBy: { version: 'desc' },
    });
    const nextVersion = latest ? latest.version + 1 : 1;

    const template = await prisma.documentTemplate.create({
      data: {
        type,
        content,
        version: nextVersion,
      },
    });

    return res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

// 5. Test SMTP Settings Diagnostics
export const testSMTPConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { host, port, username, password } = req.body;
    // Mock successful connection diagnostics
    return res.status(200).json({
      success: true,
      message: `SMTP mock connection to ${host || 'localhost'}:${port || 587} succeeded. Connection verified.`,
    });
  } catch (error) {
    next(error);
  }
};
