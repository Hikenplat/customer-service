import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../database/db';
import { LoginCredentials, ApiResponse, AuthToken, AdminPermission } from '../types';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Login
router.post('/login', async (req, res: Response<ApiResponse<AuthToken>>) => {
  const { email, password }: LoginCredentials = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password required' });
    return;
  }

  try {
  const db = await getDb();
  const admin = db.data.admin_users.find((u: any) => (u.email || '').toLowerCase() === (email || '').toLowerCase());

    console.log('Login attempt for:', email);
    console.log('Admin found:', admin ? 'Yes' : 'No');
    if (admin) {
      console.log('Stored hash:', admin.password);
      console.log('Trying password:', password);
    }

    if (!admin) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    console.log('Password valid:', validPassword);

    if (!validPassword) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (!admin.is_active) {
      res.status(403).json({ success: false, error: 'Account is disabled' });
      return;
    }

    // Update last login
    admin.last_login_at = new Date().toISOString();
    await db.write();

    // Generate JWT token
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
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        token,
        expiresIn: 86400,
        user: {
          id: admin.id,
          email: admin.email,
          fullName: admin.full_name,
          role: admin.role,
          permissions
        }
      }
    });
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
