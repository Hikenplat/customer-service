import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../database/prismaClient';
import { LoginCredentials, ApiResponse, AuthToken, AdminPermission } from '../types';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

interface RegistrationPayload {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

function buildAuthResponse(data: AuthToken['user'], token: string) {
  return {
    success: true,
    data: {
      token,
      expiresIn: TOKEN_EXPIRY_SECONDS,
      user: data
    }
  } satisfies ApiResponse<AuthToken>;
}

router.post('/register', async (req, res: Response<ApiResponse<AuthToken>>) => {
  const { fullName, email, password, phone }: RegistrationPayload = req.body || {};

  if (!fullName || !email || !password) {
    res.status(400).json({ success: false, error: 'Full name, email, and password are required' });
    return;
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const existingAdmin = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
    if (existingAdmin) {
      res.status(409).json({ success: false, error: 'Account already exists. Please sign in instead.' });
      return;
    }

    const existingUser = await prisma.portalUser.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      res.status(409).json({ success: false, error: 'Account already exists. Please sign in instead.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.portalUser.create({
      data: {
        fullName: fullName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone?.trim() || null
      }
    });

    const authPayload = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: 'customer',
      permissions: [] as AdminPermission[]
    } as AuthToken['user'];

    const secret = process.env.JWT_SECRET || 'default-secret-change-this';
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: 'customer',
        permissions: []
      },
      secret,
      { expiresIn: TOKEN_EXPIRY_SECONDS }
    );

    const response = buildAuthResponse(authPayload, token);
    res.status(201).json(response);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res: Response<ApiResponse<AuthToken>>) => {
  const { email, password }: LoginCredentials = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password required' });
    return;
  }

  try {
    const normalizedEmail = email.toLowerCase();

    const admin = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail }
    });

    if (admin) {
      const validPassword = await bcrypt.compare(password, admin.password);

      if (!validPassword) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      if (!admin.isActive) {
        res.status(403).json({ success: false, error: 'Account is disabled' });
        return;
      }

      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() }
      });

      const secret = process.env.JWT_SECRET || 'default-secret-change-this';
      const permissions = admin.permissions as AdminPermission[];

      const token = jwt.sign(
        {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          permissions
        },
        secret,
        { expiresIn: TOKEN_EXPIRY_SECONDS }
      );

      const response = buildAuthResponse(
        {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role,
          permissions
        },
        token
      );

      res.json(response);
      return;
    }

    const customer = await prisma.portalUser.findUnique({
      where: { email: normalizedEmail }
    });

    if (!customer) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, customer.password);
    if (!validPassword) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const secret = process.env.JWT_SECRET || 'default-secret-change-this';
    const token = jwt.sign(
      {
        id: customer.id,
        email: customer.email,
        role: 'customer',
        permissions: []
      },
      secret,
      { expiresIn: TOKEN_EXPIRY_SECONDS }
    );

    const response = buildAuthResponse(
      {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
        role: 'customer',
        permissions: []
      },
      token
    );

    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req: AuthRequest, res: Response<ApiResponse<any>>) => {
  res.json({
    success: true,
    data: req.user
  });
});

// Verify token
router.post('/verify', authenticateToken, (_req: AuthRequest, res: Response<ApiResponse<boolean>>) => {
  res.json({ success: true, data: true });
});

export default router;
