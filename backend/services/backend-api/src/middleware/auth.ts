import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  client_id: string | null;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, config.auth.jwtSecret) as TokenPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requirePermission(action: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (user.role === 'admin') { next(); return; }

    const hostname = req.params['hostname'] ?? req.body?.hostname ?? '';
    if (!canDo(user, action, hostname)) {
      res.status(403).json({ error: `Permission denied: ${action}` });
      return;
    }
    next();
  };
}

function canDo(user: TokenPayload, action: string, _hostname: string): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'viewer') return action === 'read';
  // operator: read always allowed
  if (action === 'read') return true;
  return false;
}

export function getHostFilter(user: TokenPayload, allowedHosts: string[]): string[] | null {
  if (user.role === 'admin') return null; // null = no filter, show all
  return allowedHosts;
}
