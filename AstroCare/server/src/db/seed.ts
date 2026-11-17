import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './pool.js';

const CREW = [
  { callSign: 'AC-01', firstName: 'Mara', lastName: 'Chen', title: 'Mission specialist', tone: 'teal', email: 'astronaut@astrocare.demo', password: 'OrbitCrew!26', hr: 72, spo2: 98, systolic: 118, diastolic: 76, temp: 36.8, respiration: 15, pressure: 4.3, radiation: 0.14 },
  { callSign: 'AC-02', firstName: 'Eli', lastName: 'Navarro', title: 'Flight engineer', tone: 'blue', email: 'eli@astrocare.demo', password: 'OrbitCrew!26', hr: 78, spo2: 97, systolic: 122, diastolic: 78, temp: 36.9, respiration: 16, pressure: 4.2, radiation: 0.16 },
  { callSign: 'AC-03', firstName: 'Nia', lastName: 'Okafor', title: 'Payload specialist', tone: 'violet', email: 'nia@astrocare.demo', password: 'OrbitCrew!26', hr: 74, spo2: 98, systolic: 116, diastolic: 74, temp: 36.7, respiration: 15, pressure: 4.4, radiation: 0.13 },
] as const;

interface IdRow extends RowDataPacket { id: number }

async function ensureUser(email: string, displayName: string, password: string): Promise<number> {
  const [existing] = await pool.execute<IdRow[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing[0]) return Number(existing[0].id);
  const hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
    [email, hash, displayName],
  );
  return Number(result.insertId);
}

function ecgWave(seed: number): number[] {
  return Array.from({ length: 80 }, (_, i) => {
    const phase = (i + seed) % 20;
    const baseline = Math.sin((i + seed) * 0.34) * 0.035;
    const p = phase === 4 ? 0.13 : phase === 5 ? 0.08 : 0;
    const qrs = phase === 9 ? -0.14 : phase === 10 ? 1.02 : phase === 11 ? -0.24 : 0;
    const t = phase === 15 ? 0.28 : phase === 16 ? 0.11 : 0;
    return Number((baseline + p + qrs + t).toFixed(3));
  });
}

export async function seedInitialData(): Promise<void> {
  await pool.execute("INSERT INTO roles (name) VALUES ('ROLE_FLIGHT_SURGEON'), ('ROLE_ASTRONAUT') ON DUPLICATE KEY UPDATE name = VALUES(name)");
  const surgeonId = await ensureUser('surgeon@astrocare.demo', 'Dr. Rowan Hale', 'FlightDoc!26');
  const [roles] = await pool.execute<(RowDataPacket & { id: number; name: string })[]>(
    'SELECT id, name FROM roles WHERE name IN (?, ?)',
    ['ROLE_FLIGHT_SURGEON', 'ROLE_ASTRONAUT'],
  );
  const roleIds = new Map(roles.map((row) => [row.name, Number(row.id)]));
  const surgeonRoleId = roleIds.get('ROLE_FLIGHT_SURGEON');
  const astronautRoleId = roleIds.get('ROLE_ASTRONAUT');
  if (surgeonRoleId === undefined || astronautRoleId === undefined) throw new Error('Required AstroCare roles were not created.');
  await pool.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [surgeonId, surgeonRoleId]);

  const [missionRows] = await pool.execute<IdRow[]>('SELECT id FROM mission_details WHERE mission_code = ? LIMIT 1', ['AC-DEMO-01']);
  let missionId: number;
  if (missionRows[0]) missionId = Number(missionRows[0].id);
  else {
    const [missionResult] = await pool.execute<ResultSetHeader>(
      'INSERT INTO mission_details (mission_code, mission_name, vehicle_name, mission_phase) VALUES (?, ?, ?, ?)',
      ['AC-DEMO-01', 'Orbital Health Demonstration', 'Crew Vehicle 01', 'IN_FLIGHT'],
    );
    missionId = Number(missionResult.insertId);
  }

  for (let index = 0; index < CREW.length; index += 1) {
    const crew = CREW[index];
    const fullName = `${crew.firstName} ${crew.lastName}`;
    const userId = await ensureUser(crew.email, fullName, crew.password);
    await pool.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, astronautRoleId]);

    const [astronautRows] = await pool.execute<IdRow[]>('SELECT id FROM astronauts WHERE call_sign = ? LIMIT 1', [crew.callSign]);
    let astronautId: number;
    if (astronautRows[0]) astronautId = Number(astronautRows[0].id);
    else {
      const [astronautResult] = await pool.execute<ResultSetHeader>(
        'INSERT INTO astronauts (user_id, mission_id, call_sign, first_name, last_name, title, avatar_tone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, missionId, crew.callSign, crew.firstName, crew.lastName, crew.title, crew.tone],
      );
      astronautId = Number(astronautResult.insertId);
    }

    await pool.execute('INSERT IGNORE INTO simulator_states (astronaut_id, mode) VALUES (?, ?)', [astronautId, 'NORMAL']);
    const [vitalCounts] = await pool.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM vital_signs WHERE astronaut_id = ?',
      [astronautId],
    );
    if (Number(vitalCounts[0]?.total ?? 0) === 0) {
      for (let sample = 11; sample >= 0; sample -= 1) {
        const minutesAgo = sample * 2;
        const jitter = ((sample * 7 + index * 3) % 5) - 2;
        const recordedAt = new Date(Date.now() - minutesAgo * 60_000);
        await pool.execute(
          `INSERT INTO vital_signs
           (astronaut_id, heart_rate, spo2, systolic_bp, diastolic_bp, core_temperature_c, respiratory_rate,
            ecg_lead_ii, eva_suit_pressure_psi, radiation_msv_h, aux_signals, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            astronautId,
            crew.hr + jitter,
            crew.spo2 - Math.max(0, jitter) * 0.1,
            crew.systolic + jitter,
            crew.diastolic + Math.round(jitter / 2),
            crew.temp + jitter * 0.03,
            crew.respiration + jitter * 0.25,
            JSON.stringify(ecgWave(sample + index)),
            crew.pressure,
            crew.radiation,
            JSON.stringify({ ocularMisalignmentDeg: 0.2, cephalicFluidShiftIndex: 0.18 }),
            recordedAt,
          ],
        );
      }
    }

    const [historyCount] = await pool.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM medical_history WHERE astronaut_id = ?',
      [astronautId],
    );
    if (Number(historyCount[0]?.total ?? 0) === 0) {
      await pool.execute(
        'INSERT INTO medical_history (astronaut_id, record_type, clinical_note, recorded_by) VALUES (?, ?, ?, ?)',
        [astronautId, 'DEMO_BASELINE', 'Synthetic baseline profile seeded for presentation and simulator workflows.', surgeonId],
      );
    }
  }
}
