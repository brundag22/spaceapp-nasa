import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { requireAuth, requireCsrf, requireRole } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../errors.js';
import type { AuthUser } from '../types.js';
import { assertCanView } from './astronauts.js';

const router = Router();
router.use(requireAuth);
const markerSchema = z.object({
  astronautId: z.number().int().positive(),
  bodyZone: z.enum(['CRANIAL_OCULAR', 'THORACIC_CARDIAC', 'THORACIC_CHEST', 'PULMONARY', 'PERIPHERAL_SUIT', 'ABDOMEN']),
  coordX: z.number().min(0).max(100),
  coordY: z.number().min(0).max(100),
  severity: z.enum(['YELLOW', 'ORANGE', 'RED']),
  clinicalNote: z.string().trim().min(3).max(1200),
});

router.get('/anatomy/markers', asyncRoute(async (req, res) => {
  const auth = res.locals.auth as AuthUser;
  const selected = req.query.astronautId ? Number(req.query.astronautId) : undefined;
  if (auth.role === 'ROLE_ASTRONAUT') {
    if (selected && selected !== auth.astronautId) throw new HttpError(403, 'Astronaut accounts can only view their own markers.', 'ROLE_FORBIDDEN');
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, astronaut_id AS astronautId, created_by AS createdBy, body_zone AS bodyZone, coord_x AS coordX, coord_y AS coordY, severity, clinical_note AS clinicalNote, resolved, created_at AS createdAt FROM anatomical_markers WHERE astronaut_id = ? ORDER BY created_at DESC',
      [auth.astronautId],
    );
    res.json({ markers: rows });
    return;
  }
  const [rows] = selected
    ? await pool.execute<RowDataPacket[]>(
      'SELECT id, astronaut_id AS astronautId, created_by AS createdBy, body_zone AS bodyZone, coord_x AS coordX, coord_y AS coordY, severity, clinical_note AS clinicalNote, resolved, created_at AS createdAt FROM anatomical_markers WHERE astronaut_id = ? ORDER BY created_at DESC',
      [selected],
    )
    : await pool.query<RowDataPacket[]>(
      'SELECT id, astronaut_id AS astronautId, created_by AS createdBy, body_zone AS bodyZone, coord_x AS coordX, coord_y AS coordY, severity, clinical_note AS clinicalNote, resolved, created_at AS createdAt FROM anatomical_markers ORDER BY created_at DESC LIMIT 200',
    );
  res.json({ markers: rows });
}));

router.post('/anatomy/markers', requireRole('ROLE_FLIGHT_SURGEON'), requireCsrf, asyncRoute(async (req, res) => {
  const input = markerSchema.parse(req.body);
  const auth = res.locals.auth as AuthUser;
  const [crew] = await pool.execute<RowDataPacket[]>('SELECT id FROM astronauts WHERE id = ?', [input.astronautId]);
  if (!crew.length) throw new HttpError(404, 'Crew member not found.', 'ASTRONAUT_NOT_FOUND');
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO anatomical_markers (astronaut_id, created_by, body_zone, coord_x, coord_y, severity, clinical_note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.astronautId, auth.userId, input.bodyZone, input.coordX, input.coordY, input.severity, input.clinicalNote],
  );
  await pool.execute(
    'INSERT INTO medical_history (astronaut_id, record_type, clinical_note, recorded_by) VALUES (?, ?, ?, ?)',
    [input.astronautId, 'ANATOMICAL_MARKER', `${input.bodyZone} · ${input.severity}: ${input.clinicalNote}`, auth.userId],
  );
  res.status(201).json({ ok: true, markerId: Number(result.insertId), message: 'Marker saved to the medical record.' });
}));

router.patch('/anatomy/markers/:markerId', requireRole('ROLE_FLIGHT_SURGEON'), requireCsrf, asyncRoute(async (req, res) => {
  const markerId = z.coerce.number().int().positive().parse(req.params.markerId);
  const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE anatomical_markers SET resolved = ?, resolved_at = ? WHERE id = ?',
    [resolved, resolved ? new Date() : null, markerId],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Anatomical marker not found.', 'MARKER_NOT_FOUND');
  res.json({ ok: true, resolved });
}));

export default router;
