import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncRoute } from '../errors.js';
import type { AuthUser } from '../types.js';
import { hashToken, newToken, requireAuth, requireCsrf, sessionDurationMs, setSessionCookie } from './session.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });
const loginSchema = z.object({ email: z.string().email().max(190), password: z.string().min(1).max(120) });

interface LoginRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  role: 'ROLE_FLIGHT_SURGEON' | 'ROLE_ASTRONAUT';
  astronaut_id: number | null;
}

function publicUser(row: Pick<LoginRow, 'id' | 'email' | 'display_name' | 'role' | 'astronaut_id'>) {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    astronautId: row.astronaut_id === null ? null : Number(row.astronaut_id),
  };
}

router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email and password.', code: 'INVALID_LOGIN' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const [rows] = await pool.execute<LoginRow[]>(
    `SELECT u.id, u.email, u.display_name, u.password_hash, r.name AS role, a.id AS astronaut_id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     LEFT JOIN astronauts a ON a.user_id = u.id
     WHERE u.email = ? AND u.active = TRUE
     LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) {
    res.status(401).json({ error: 'Email or password was not recognized.', code: 'LOGIN_FAILED' });
    return;
  }

  const token = newToken();
  const csrfToken = newToken(24);
  const expiresAt = new Date(Date.now() + sessionDurationMs());
  await pool.execute<ResultSetHeader>(
    'INSERT INTO application_sessions (token_hash, user_id, csrf_hash, expires_at) VALUES (?, ?, ?, ?)',
    [hashToken(token), row.id, hashToken(csrfToken), expiresAt],
  );
  setSessionCookie(res, token);
  res.json({ user: publicUser(row), csrfToken });
}));

router.get('/me', requireAuth, asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as AuthUser;
  const csrfToken = newToken(24);
  const csrfHash = hashToken(csrfToken);
  await pool.execute('UPDATE application_sessions SET csrf_hash = ?, last_seen_at = UTC_TIMESTAMP(3) WHERE token_hash = ?', [csrfHash, auth.sessionTokenHash]);
  res.json({
    user: { id: auth.userId, email: auth.email, displayName: auth.displayName, role: auth.role, astronautId: auth.astronautId },
    csrfToken,
  });
}));

router.post('/logout', requireAuth, requireCsrf, asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as AuthUser;
  await pool.execute('DELETE FROM application_sessions WHERE token_hash = ?', [auth.sessionTokenHash]);
  res.clearCookie('astrocare_session', { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
  res.json({ ok: true });
}));

export default router;
