import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from '../db';
import config from '../config';

const router = Router();

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'operator' | 'viewer';
  client_id: string | null;
}

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  const user = getDb()
    .prepare('SELECT id, username, password_hash, role, client_id FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, client_id: user.client_id },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn } as jwt.SignOptions,
  );

  res.json({ token, role: user.role, expiresIn: config.auth.jwtExpiresIn });
});

export default router;
