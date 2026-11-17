import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool.js';
import type { AuthUser, RoleName } from '../types.js';

const COOKIE_NAME = 'astrocare_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function setSessionCookie(res: Parameters<RequestHandler>[1], token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_MS,
  });
}

interface SessionRow extends RowDataPacket {
  user_id: number;
  email: string;
  display_name: string;
  role: RoleName;
  astronaut_id: number | null;
  token_hash: string;
  csrf_hash: string;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }
    const tokenHash = hashToken(rawToken);
    const [rows] = await pool.execute<SessionRow[]>(
      `SELECT u.id AS user_id, u.email, u.display_name, r.name AS role, a.id AS astronaut_id,
              s.token_hash, s.csrf_hash
       FROM application_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN astronauts a ON a.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.active = TRUE
       LIMIT 1`,
      [tokenHash],
    );
    if (!rows[0]) {
      res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
      res.status(401).json({ error: 'Session expired. Sign in again.', code: 'SESSION_EXPIRED' });
      return;
    }
    res.locals.auth = {
      userId: Number(rows[0].user_id),
      email: rows[0].email,
      displayName: rows[0].display_name,
      role: rows[0].role,
      astronautId: rows[0].astronaut_id === null ? null : Number(rows[0].astronaut_id),
      sessionTokenHash: rows[0].token_hash,
      csrfHash: rows[0].csrf_hash,
    } satisfies AuthUser;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...allowed: RoleName[]): RequestHandler {
  return (_req, res, next) => {
    const auth = res.locals.auth as AuthUser | undefined;
    if (!auth || !allowed.includes(auth.role)) {
      res.status(403).json({ error: 'This action is not available for your role.', code: 'ROLE_FORBIDDEN' });
      return;
    }
    next();
  };
}

export const requireCsrf: RequestHandler = async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthUser | undefined;
    const supplied = req.header('x-csrf-token');
    if (!auth || !supplied) {
      res.status(403).json({ error: 'Security token missing. Refresh the session and try again.', code: 'CSRF_REQUIRED' });
      return;
    }
    const expectedHash = Buffer.from(auth.csrfHash, 'hex');
    const suppliedHash = Buffer.from(hashToken(supplied), 'hex');
    if (expectedHash.length !== suppliedHash.length || !timingSafeEqual(expectedHash, suppliedHash)) {
      res.status(403).json({ error: 'Security token expired. Refresh the session and try again.', code: 'CSRF_INVALID' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function sessionDurationMs(): number {
  return SESSION_MS;
}
