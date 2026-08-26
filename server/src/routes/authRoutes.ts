import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { credentialsSchema } from '../validation/schemas';

export const authRoutes = Router();

function tokenFor(user: { id: string; email: string }): string {
  return jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '7d' });
}

authRoutes.post('/api/auth/register', async (req, res) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const { email, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { res.status(409).json({ error: 'Email is already registered' }); return; }
    const user = await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
    res.status(201).json({ token: tokenFor(user), user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('[Auth] Registration failed:', error);
    res.status(500).json({ error: 'Registration service unavailable' });
  }
});

authRoutes.post('/api/auth/login', async (req, res) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' }); return;
    }
    res.json({ token: tokenFor(user), user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
});
