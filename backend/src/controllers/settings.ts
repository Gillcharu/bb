import { Request, Response, NextFunction } from 'express';
import net from 'net';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandlers';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

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

    // Privilege escalation guard: only a SYSTEM_ADMIN may create another
    // SYSTEM_ADMIN account.
    if (role === 'SYSTEM_ADMIN' && req.user!.role !== 'SYSTEM_ADMIN') {
      return next(new AppError('Only a System Administrator can create administrator accounts', 403, 'FORBIDDEN'));
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return next(new AppError('User email already exists', 400));
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
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

    // Version increment inside a transaction; the (type, version) unique
    // constraint guarantees no duplicate versions under concurrent writes.
    const template = await prisma.$transaction(async tx => {
      const latest = await tx.documentTemplate.findFirst({
        where: { type },
        orderBy: { version: 'desc' },
      });
      const nextVersion = latest ? latest.version + 1 : 1;

      return tx.documentTemplate.create({
        data: {
          type,
          content,
          version: nextVersion,
        },
      });
    });

    return res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

// 5. Test SMTP Settings Diagnostics — performs a real TCP reachability check
// against the configured host/port. Credentials are never stored or logged.
export const testSMTPConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { host, port } = req.body;

    const reachable = await new Promise<boolean>(resolve => {
      const socket = net.createConnection({ host, port: Number(port), timeout: 5000 });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (!reachable) {
      return next(new AppError(`Could not reach SMTP server at ${host}:${port}. Check the host, port and firewall rules.`, 400, 'SMTP_UNREACHABLE'));
    }

    return res.status(200).json({
      success: true,
      message: `SMTP server at ${host}:${port} is reachable. Full delivery verification requires the mail dispatch connector.`,
    });
  } catch (error) {
    next(error);
  }
};
