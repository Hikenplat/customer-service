import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { AdminPermission } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        permissions: AdminPermission[];
      };
    }
  }
}

export interface AuthRequest extends Request {}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ success: false, error: 'Access token required' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'default-secret-change-this';
    const decoded = jwt.verify(token, secret) as {
      id: string;
      email: string;
      role: string;
      permissions: AdminPermission[];
    };

    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: AdminPermission) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({ success: false, error: `Permission denied: ${permission} required` });
      return;
    }

    next();
  };
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: `Role denied: ${roles.join(' or ')} required` });
      return;
    }

    next();
  };
}
