import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool.js';
import { broadcastTopic } from '../realtime/stomp.js';
import type { SimulationMode, VitalReading } from '../types.js';
import { evaluateReading, overallSeverity } from './rules.js';
import { makeReading, type CrewBaseline } from './telemetry.js';

interface AstronautRow extends RowDataPacket, CrewBaseline {}
interface ActiveAlertRow extends RowDataPacket { id: number; category: string; severity: string }

async function persistAndEvaluate(baseline: AstronautRow): Promise<void> {
  const reading = makeReading(baseline);
  const [inserted] = await pool.execute<ResultSetHeader>(
    `INSERT INTO vital_signs
     (astronaut_id, heart_rate, spo2, systolic_bp, diastolic_bp, core_temperature_c, respiratory_rate,
      ecg_lead_ii, eva_suit_pressure_psi, radiation_msv_h, aux_signals, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [reading.astronautId, reading.heartRate, reading.spo2, reading.systolicBp, reading.diastolicBp,
      reading.coreTemperatureC, reading.respiratoryRate, JSON.stringify(reading.ecgLeadIi), reading.evaSuitPressurePsi,
      reading.radiationMsvH, JSON.stringify(reading.auxSignals), new Date(reading.recordedAt)],
  );
  reading.id = Number(inserted.insertId);

  const flags = evaluateReading(reading, baseline.mode);
  const categories = flags.map((flag) => flag.category);
  const [existing] = await pool.execute<ActiveAlertRow[]>(
    "SELECT id, category, severity FROM health_alerts WHERE astronaut_id = ? AND status = 'OPEN'",
    [reading.astronautId],
  );
  for (const old of existing) {
    if (!categories.includes(old.category)) {
      await pool.execute("UPDATE health_alerts SET status = 'RESOLVED', resolved_at = UTC_TIMESTAMP(3) WHERE id = ?", [old.id]);
    }
  }

  const [surgeons] = await pool.execute<(RowDataPacket & { id: number })[]>(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'ROLE_FLIGHT_SURGEON' AND u.active = TRUE`,
  );
  const activeAlerts = [];
  for (const flag of flags) {
    const prior = existing.find((row) => row.category === flag.category);
    if (prior) {
      await pool.execute('UPDATE health_alerts SET severity = ?, description = ?, vital_sign_id = ? WHERE id = ?',
        [flag.severity, flag.description, reading.id, prior.id]);
      activeAlerts.push({ ...flag, id: Number(prior.id), status: 'OPEN' });
      continue;
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO health_alerts (astronaut_id, vital_sign_id, category, title, description, body_zone, severity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reading.astronautId, reading.id, flag.category, flag.title, flag.description, flag.bodyZone, flag.severity],
    );
    const alertId = Number(result.insertId);
    activeAlerts.push({ ...flag, id: alertId, status: 'OPEN' });
    for (const surgeon of surgeons) {
      await pool.execute(
        'INSERT INTO notifications (user_id, health_alert_id, title, message) VALUES (?, ?, ?, ?)',
        [surgeon.id, alertId, flag.title, `${baseline.call_sign}: ${flag.description}`],
      );
      broadcastTopic(`/topic/notifications/${Number(surgeon.id)}`, {
        type: 'HEALTH_ALERT', title: flag.title, message: `${baseline.call_sign}: ${flag.description}`,
        alertId, astronautId: reading.astronautId, createdAt: new Date().toISOString(),
      });
    }
  }

  const status = overallSeverity(flags);
  broadcastTopic(`/topic/telemetry/${reading.astronautId}`, {
    type: 'TELEMETRY', reading, severity: status, mode: baseline.mode, alerts: activeAlerts,
    astronaut: { id: reading.astronautId, callSign: baseline.call_sign, name: `${baseline.first_name} ${baseline.last_name}` },
  });
  broadcastTopic(`/topic/alerts/${reading.astronautId}`, { type: 'ALERTS', alerts: activeAlerts, severity: status });
}

async function tick(): Promise<void> {
  const [rows] = await pool.execute<AstronautRow[]>(
    `SELECT a.id AS astronaut_id, a.call_sign, a.first_name, a.last_name,
            ss.mode, baseline.heart_rate, baseline.spo2, baseline.systolic_bp, baseline.diastolic_bp,
            baseline.core_temperature_c, baseline.respiratory_rate, baseline.eva_suit_pressure_psi, baseline.radiation_msv_h
     FROM astronauts a
     JOIN simulator_states ss ON ss.astronaut_id = a.id
     JOIN (SELECT astronaut_id, MIN(id) AS baseline_id FROM vital_signs GROUP BY astronaut_id) first_sample
       ON first_sample.astronaut_id = a.id
     JOIN vital_signs baseline ON baseline.id = first_sample.baseline_id
     ORDER BY a.call_sign`,
  );
  for (const row of rows) await persistAndEvaluate(row);
}

let timer: NodeJS.Timeout | null = null;
let lockConnection: PoolConnection | null = null;
let isTicking = false;

export async function startTelemetryScheduler(): Promise<void> {
  if (timer) return;
  const connection = await pool.getConnection();
  const [lockRows] = await connection.query<(RowDataPacket & { acquired: number | null })[]>(
    "SELECT GET_LOCK('astrocare_telemetry_scheduler', 0) AS acquired",
  );
  if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
    connection.release();
    console.info('Telemetry scheduler already active in another application process.');
    return;
  }
  lockConnection = connection;
  const run = async () => {
    if (isTicking) return;
    isTicking = true;
    try { await tick(); }
    catch (error) { console.error('Telemetry tick failed:', error instanceof Error ? error.message : 'unknown error'); }
    finally { isTicking = false; }
  };
  await run();
  timer = setInterval(() => { void run(); }, 2_000);
  console.info('Two-second telemetry scheduler active.');
}

export async function stopTelemetryScheduler(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  if (lockConnection) {
    try { await lockConnection.query("SELECT RELEASE_LOCK('astrocare_telemetry_scheduler')"); }
    finally { lockConnection.release(); lockConnection = null; }
  }
}

export function parseJsonArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(Number) : []; }
    catch { return []; }
  }
  return [];
}

export function parseJsonObject(value: unknown): VitalReading['auxSignals'] {
  const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return {}; } })() : value;
  const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  return {
    ocularMisalignmentDeg: Number(record.ocularMisalignmentDeg ?? 0),
    cephalicFluidShiftIndex: Number(record.cephalicFluidShiftIndex ?? 0),
  };
}

export function toReading(row: Record<string, unknown>): VitalReading {
  return {
    id: Number(row.id), astronautId: Number(row.astronaut_id), heartRate: Number(row.heart_rate),
    spo2: Number(row.spo2), systolicBp: Number(row.systolic_bp), diastolicBp: Number(row.diastolic_bp),
    coreTemperatureC: Number(row.core_temperature_c), respiratoryRate: Number(row.respiratory_rate),
    ecgLeadIi: parseJsonArray(row.ecg_lead_ii), evaSuitPressurePsi: Number(row.eva_suit_pressure_psi),
    radiationMsvH: Number(row.radiation_msv_h), auxSignals: parseJsonObject(row.aux_signals),
    recordedAt: new Date(String(row.recorded_at)).toISOString(), mode: (row.mode as SimulationMode | undefined) ?? 'NORMAL',
  };
}
