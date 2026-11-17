import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../errors.js';
import type { AuthUser } from '../types.js';
import { parseJsonArray, parseJsonObject, toReading } from '../services/simulator.js';

const router = Router();
router.use(requireAuth);

interface CrewViewRow extends RowDataPacket {
  id: number; user_id: number | null; call_sign: string; first_name: string; last_name: string; title: string;
  status: string; avatar_tone: string; mission_name: string; mission_phase: string; mode: string;
  latest_id: number | null; heart_rate: number | null; spo2: number | null; systolic_bp: number | null;
  diastolic_bp: number | null; core_temperature_c: number | null; respiratory_rate: number | null;
  ecg_lead_ii: unknown; eva_suit_pressure_psi: number | null; radiation_msv_h: number | null;
  aux_signals: unknown; recorded_at: Date | string | null; alert_count: number; top_severity: string | null;
}

function assertCanView(auth: AuthUser, astronautId: number): void {
  if (auth.role === 'ROLE_ASTRONAUT' && auth.astronautId !== astronautId) {
    throw new HttpError(403, 'Astronaut accounts can only open their own medical record.', 'ROLE_FORBIDDEN');
  }
}

function mapCrew(row: CrewViewRow) {
  const latest = row.latest_id === null ? null : toReading({
    id: row.latest_id, astronaut_id: row.id, heart_rate: row.heart_rate, spo2: row.spo2,
    systolic_bp: row.systolic_bp, diastolic_bp: row.diastolic_bp, core_temperature_c: row.core_temperature_c,
    respiratory_rate: row.respiratory_rate, ecg_lead_ii: parseJsonArray(row.ecg_lead_ii),
    eva_suit_pressure_psi: row.eva_suit_pressure_psi, radiation_msv_h: row.radiation_msv_h,
    aux_signals: parseJsonObject(row.aux_signals), recorded_at: row.recorded_at, mode: row.mode,
  } as Record<string, unknown>);
  return {
    id: Number(row.id), userId: row.user_id === null ? null : Number(row.user_id), callSign: row.call_sign,
    firstName: row.first_name, lastName: row.last_name, title: row.title, status: row.status,
    avatarTone: row.avatar_tone, missionName: row.mission_name, missionPhase: row.mission_phase,
    mode: row.mode, latest, alertCount: Number(row.alert_count),
    severity: (row.top_severity ?? 'GREEN') as 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED',
  };
}

const crewSql = `SELECT a.id, a.user_id, a.call_sign, a.first_name, a.last_name, a.title, a.status, a.avatar_tone,
       m.mission_name, m.mission_phase, ss.mode,
       v.id AS latest_id, v.heart_rate, v.spo2, v.systolic_bp, v.diastolic_bp, v.core_temperature_c,
       v.respiratory_rate, v.ecg_lead_ii, v.eva_suit_pressure_psi, v.radiation_msv_h, v.aux_signals, v.recorded_at,
       (SELECT COUNT(*) FROM health_alerts ha WHERE ha.astronaut_id = a.id AND ha.status = 'OPEN') AS alert_count,
       (SELECT CASE MAX(CASE severity WHEN 'RED' THEN 4 WHEN 'ORANGE' THEN 3 WHEN 'YELLOW' THEN 2 ELSE 1 END)
          WHEN 4 THEN 'RED' WHEN 3 THEN 'ORANGE' WHEN 2 THEN 'YELLOW' ELSE 'GREEN' END
          FROM health_alerts ha WHERE ha.astronaut_id = a.id AND ha.status = 'OPEN') AS top_severity
     FROM astronauts a
     JOIN mission_details m ON m.id = a.mission_id
     JOIN simulator_states ss ON ss.astronaut_id = a.id
     LEFT JOIN (
       SELECT sample.* FROM vital_signs sample
       JOIN (SELECT astronaut_id, MAX(id) AS latest_id FROM vital_signs GROUP BY astronaut_id) newest
         ON newest.latest_id = sample.id
     ) v ON v.astronaut_id = a.id`;

router.get('/astronauts', asyncRoute(async (_req, res) => {
  const auth = res.locals.auth as AuthUser;
  const [rows] = auth.role === 'ROLE_ASTRONAUT'
    ? await pool.execute<CrewViewRow[]>(`${crewSql} WHERE a.id = ? ORDER BY a.call_sign`, [auth.astronautId])
    : await pool.query<CrewViewRow[]>(`${crewSql} ORDER BY a.call_sign`);
  res.json({ astronauts: rows.map(mapCrew) });
}));

const idSchema = z.coerce.number().int().positive();
router.get('/health/latest/:astronautId', asyncRoute(async (req, res) => {
  const astronautId = idSchema.parse(req.params.astronautId);
  const auth = res.locals.auth as AuthUser;
  assertCanView(auth, astronautId);
  const [rows] = await pool.execute<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT v.*, ss.mode FROM vital_signs v JOIN simulator_states ss ON ss.astronaut_id = v.astronaut_id
     WHERE v.astronaut_id = ? ORDER BY v.recorded_at DESC, v.id DESC LIMIT 1`,
    [astronautId],
  );
  if (!rows[0]) throw new HttpError(404, 'No telemetry is available for this crew member yet.', 'TELEMETRY_NOT_FOUND');
  const [alerts] = await pool.execute<RowDataPacket[]>(
    "SELECT id, category, title, description, body_zone AS bodyZone, severity, status, created_at AS createdAt FROM health_alerts WHERE astronaut_id = ? AND status = 'OPEN' ORDER BY created_at DESC",
    [astronautId],
  );
  const [markers] = await pool.execute<RowDataPacket[]>(
    'SELECT id, astronaut_id AS astronautId, created_by AS createdBy, body_zone AS bodyZone, coord_x AS coordX, coord_y AS coordY, severity, clinical_note AS clinicalNote, resolved, created_at AS createdAt FROM anatomical_markers WHERE astronaut_id = ? AND resolved = FALSE ORDER BY created_at DESC',
    [astronautId],
  );
  res.json({ reading: toReading(rows[0]), alerts, markers });
}));

router.get('/health/history/:astronautId', asyncRoute(async (req, res) => {
  const astronautId = idSchema.parse(req.params.astronautId);
  const auth = res.locals.auth as AuthUser;
  assertCanView(auth, astronautId);
  const parsed = z.coerce.number().int().min(1).max(500).catch(120).parse(req.query.limit);
  const [rows] = await pool.execute<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT v.*, ss.mode FROM vital_signs v JOIN simulator_states ss ON ss.astronaut_id = v.astronaut_id
     WHERE v.astronaut_id = ? ORDER BY v.recorded_at DESC, v.id DESC LIMIT ${parsed}`,
    [astronautId],
  );
  res.json({ readings: rows.reverse().map(toReading) });
}));

router.get('/health/alerts/:astronautId', asyncRoute(async (req, res) => {
  const astronautId = idSchema.parse(req.params.astronautId);
  const auth = res.locals.auth as AuthUser;
  assertCanView(auth, astronautId);
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, astronaut_id AS astronautId, category, title, description, body_zone AS bodyZone, severity, status, created_at AS createdAt FROM health_alerts WHERE astronaut_id = ? AND status = 'OPEN' ORDER BY FIELD(severity, 'RED', 'ORANGE', 'YELLOW'), created_at DESC",
    [astronautId],
  );
  res.json({ alerts: rows });
}));

export { assertCanView };
export default router;
