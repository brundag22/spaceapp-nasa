import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { requireAuth, requireCsrf, requireRole } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../errors.js';
import type { AuthUser, SimulationMode } from '../types.js';

const router = Router();
router.use(requireAuth);
const scenarioSchema = z.object({
  mode: z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'EVA_STRAIN']),
  astronautId: z.number().int().positive(),
});

router.post('/demo/simulate', requireRole('ROLE_FLIGHT_SURGEON'), requireCsrf, asyncRoute(async (req, res) => {
  const { mode, astronautId } = scenarioSchema.parse(req.body);
  const auth = res.locals.auth as AuthUser;
  const [crew] = await pool.execute<RowDataPacket[]>('SELECT id FROM astronauts WHERE id = ?', [astronautId]);
  if (!crew.length) throw new HttpError(404, 'Crew member not found.', 'ASTRONAUT_NOT_FOUND');
  await pool.execute(
    'INSERT INTO simulator_states (astronaut_id, mode, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mode = VALUES(mode), updated_by = VALUES(updated_by), updated_at = UTC_TIMESTAMP(3)',
    [astronautId, mode, auth.userId],
  );
  await pool.execute(
    'INSERT INTO medical_history (astronaut_id, record_type, clinical_note, recorded_by) VALUES (?, ?, ?, ?)',
    [astronautId, 'SIMULATOR_MODE', `Flight Surgeon activated ${mode} demonstration mode.`, auth.userId],
  );
  res.json({ ok: true, astronautId, mode: mode as SimulationMode, message: `${mode.replace('_', ' ')} simulation active.`, updatedAt: new Date().toISOString() });
}));

router.post('/notifications/:notificationId/read', requireCsrf, asyncRoute(async (req, res) => {
  const auth = res.locals.auth as AuthUser;
  const notificationId = z.coerce.number().int().positive().parse(req.params.notificationId);
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE id = ? AND user_id = ?',
    [notificationId, auth.userId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
  res.json({ ok: true });
}));

export default router;
