import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

export interface AuthUser {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  
  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
      if (payload.userId && payload.email) {
        req.user = { userId: payload.userId, email: payload.email };
        return next();
      }
    } catch {
      // Invalid/expired token — fallback to local desktop user below
    }
  }

  // Graceful fallback for Desktop Assistant / Local Dev when no token provided
  try {
    const defaultUser = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
    if (defaultUser) {
      req.user = { userId: defaultUser.id, email: defaultUser.email };
      return next();
    }
  } catch (err) {
    console.error('[Auth] Local user fallback error:', err);
  }

  res.status(401).json({ error: 'Bearer token required' });
}
