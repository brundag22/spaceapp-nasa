import { Router } from 'express';
import PDFDocument from 'pdfkit';
import type { RowDataPacket } from 'mysql2/promise';
import { requireAuth } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { asyncRoute, HttpError } from '../errors.js';
import type { AuthUser } from '../types.js';
import { assertCanView } from './astronauts.js';

const router = Router();
router.use(requireAuth);

router.get('/reports/pdf/:astronautId', asyncRoute(async (req, res) => {
  const astronautId = Number(req.params.astronautId);
  if (!Number.isInteger(astronautId) || astronautId <= 0) throw new HttpError(400, 'Invalid crew member ID.', 'INVALID_ID');
  const auth = res.locals.auth as AuthUser;
  assertCanView(auth, astronautId);
  const [crewRows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.call_sign, a.first_name, a.last_name, a.title, m.mission_name, m.mission_phase
     FROM astronauts a JOIN mission_details m ON m.id = a.mission_id WHERE a.id = ?`, [astronautId],
  );
  if (!crewRows[0]) throw new HttpError(404, 'Crew member not found.', 'ASTRONAUT_NOT_FOUND');
  const [vitals] = await pool.execute<RowDataPacket[]>(
    `SELECT heart_rate, spo2, systolic_bp, diastolic_bp, core_temperature_c, respiratory_rate,
            eva_suit_pressure_psi, radiation_msv_h, recorded_at
     FROM vital_signs WHERE astronaut_id = ? ORDER BY recorded_at DESC LIMIT 12`, [astronautId],
  );
  const [alerts] = await pool.execute<RowDataPacket[]>(
    "SELECT title, description, severity, body_zone, created_at FROM health_alerts WHERE astronaut_id = ? AND status = 'OPEN' ORDER BY created_at DESC LIMIT 12", [astronautId],
  );
  const [markers] = await pool.execute<RowDataPacket[]>(
    'SELECT body_zone, severity, clinical_note, resolved, created_at FROM anatomical_markers WHERE astronaut_id = ? ORDER BY created_at DESC LIMIT 12', [astronautId],
  );
  const crew = crewRows[0];
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `AstroCare clinical demo report — ${crew.call_sign}`, Author: 'AstroCare Mission Health Console' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="astrocare-${String(crew.call_sign).toLowerCase()}-clinical-demo.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  doc.fontSize(9).fillColor('#0d8076').text('ASTROCARE  /  MISSION HEALTH CONSOLE', { characterSpacing: 1.4 });
  doc.moveDown(0.8).fontSize(22).fillColor('#102623').text('Clinical telemetry report');
  doc.moveDown(0.35).fontSize(10).fillColor('#5c6d69').text(`Generated ${new Date().toISOString()} · SIMULATED DATA`);
  doc.moveDown(1).fontSize(13).fillColor('#102623').text(`${crew.first_name} ${crew.last_name}  ·  ${crew.call_sign}`);
  doc.fontSize(10).fillColor('#5c6d69').text(`${crew.title}  /  ${crew.mission_name}  /  ${crew.mission_phase}`);
  doc.moveDown(0.6).fontSize(10).fillColor('#8b4e1f').text('DEMO ONLY — synthetic telemetry and configurable rules; not a clinical diagnosis or flight-control dispatch.');
  doc.moveDown(1).fontSize(13).fillColor('#102623').text('Recent vital-sign samples');
  doc.moveDown(0.35).fontSize(8).fillColor('#394a46');
  for (const row of [...vitals].reverse()) {
    doc.text(`${new Date(String(row.recorded_at)).toISOString()}  |  HR ${row.heart_rate} bpm  |  SpO2 ${row.spo2}%  |  BP ${row.systolic_bp}/${row.diastolic_bp} mmHg  |  Temp ${row.core_temperature_c} °C  |  Resp ${row.respiratory_rate}/min  |  Suit ${row.eva_suit_pressure_psi} PSI  |  Rad ${row.radiation_msv_h} mSv/h`);
  }
  doc.moveDown(1).fontSize(13).fillColor('#102623').text('Open rule-engine flags');
  doc.moveDown(0.35).fontSize(9).fillColor('#394a46');
  if (!alerts.length) doc.text('No active demo flags at report time.');
  for (const alert of alerts) doc.text(`${alert.severity} · ${alert.title} · ${alert.body_zone}\n${alert.description}`, { paragraphGap: 4 });
  doc.moveDown(0.8).fontSize(13).fillColor('#102623').text('Anatomical markers');
  doc.moveDown(0.35).fontSize(9).fillColor('#394a46');
  if (!markers.length) doc.text('No markers recorded.');
  for (const marker of markers) doc.text(`${marker.resolved ? 'RESOLVED' : 'OPEN'} · ${marker.severity} · ${marker.body_zone} · ${marker.clinical_note}`);
  doc.moveDown(1.2).fontSize(8).fillColor('#75817e').text('AstroCare demonstration output. Review all readings with qualified flight-medicine staff. OSDR citations and data limitations are documented in the project README.');
  doc.end();
}));

export default router;
