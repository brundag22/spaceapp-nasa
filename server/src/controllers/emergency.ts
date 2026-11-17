import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { requireAuth, requireCsrf, requireRole } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../errors.js';
import type { AuthUser } from '../types.js';
import { broadcastTopic } from '../realtime/stomp.js';

const router = Router();
router.use(requireAuth);

router.post('/emergency/sos', requireRole('ROLE_ASTRONAUT'), requireCsrf, asyncRoute(async (req, res) => {
  const auth = res.locals.auth as AuthUser;
  if (!auth.astronautId) throw new HttpError(403, 'No astronaut profile is linked to this account.', 'PROFILE_MISSING');
  const { message } = z.object({ message: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const eventCode = `SOS-${randomUUID().slice(0, 8).toUpperCase()}`;
    const eventMessage = message || 'Crew member requested immediate medical attention.';
    const [event] = await connection.execute<ResultSetHeader>(
      'INSERT INTO emergency_events (astronaut_id, created_by, event_code, status, message) VALUES (?, ?, ?, ?, ?)',
      [auth.astronautId, auth.userId, eventCode, 'RECEIVED', eventMessage],
    );
    const [surgeons] = await connection.execute<(RowDataPacket & { id: number })[]>(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'ROLE_FLIGHT_SURGEON' AND u.active = TRUE`,
    );
    for (const surgeon of surgeons) {
      await connection.execute(
        'INSERT INTO notifications (user_id, emergency_event_id, title, message) VALUES (?, ?, ?, ?)',
        [surgeon.id, event.insertId, 'Emergency SOS received', `${auth.displayName} · ${eventCode} · ${eventMessage}`],
      );
    }
    await connection.commit();
    const payload = {
      id: Number(event.insertId), eventCode, astronautId: auth.astronautId, status: 'RECEIVED',
      message: eventMessage, createdAt: new Date().toISOString(), dispatchLabel: 'In-app demo dispatch',
    };
    for (const surgeon of surgeons) broadcastTopic(`/topic/notifications/${Number(surgeon.id)}`, { type: 'EMERGENCY_SOS', ...payload });
    res.status(201).json({ ok: true, event: payload, message: 'SOS recorded and Flight Surgeon notified in this demo console.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/notifications', asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as AuthUser;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT n.id, n.title, n.message, n.read_at AS readAt, n.created_at AS createdAt,
            n.emergency_event_id AS emergencyEventId, n.health_alert_id AS healthAlertId
     FROM notifications n WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`,
    [auth.userId],
  );
  res.json({ notifications: rows });
}));

router.post('/emergency/:eventId/acknowledge', requireRole('ROLE_FLIGHT_SURGEON'), requireCsrf, asyncRoute(async (req, res) => {
  const eventId = z.coerce.number().int().positive().parse(req.params.eventId);
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE emergency_events SET status = 'ACKNOWLEDGED', acknowledged_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'RECEIVED'",
    [eventId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'SOS event is not available for acknowledgement.', 'EVENT_NOT_FOUND');
  res.json({ ok: true, status: 'ACKNOWLEDGED' });
}));

export default router;
