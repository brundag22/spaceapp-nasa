import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import sockjs from 'sockjs';
import PDFDocument from 'pdfkit';
import { createServer as createViteServer } from 'vite';
import type {
  AnatomyMarker,
  AnatomyZone,
  AstronautProfile,
  AuthUser,
  BreachedZone,
  MarkerSeverity,
  SimulatorMode,
  SosEvent,
  TelemetrySample,
} from './src/types/astrocare.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// --- Authoritative User Directory ---
const USERS: Array<AuthUser & { passcode: string }> = [
  {
    id: 'usr-surgeon-01',
    name: 'Dr. Elena Vance',
    callsign: 'FLIGHT-SURGEON-01',
    role: 'FLIGHT_SURGEON',
    missionRole: 'Lead Flight Surgeon · Orbital Medical Ops',
    email: 'elena.vance@astrocare.space',
    passcode: 'ASTRO-MED-01',
  },
  {
    id: 'usr-astro-01',
    name: 'CDR. Marcus Chen',
    callsign: 'ISS-CDR-01',
    role: 'ASTRONAUT',
    assignedAstronautId: 'astro-01',
    missionRole: 'Mission Commander · EVA-1 Lead',
    email: 'marcus.chen@astrocare.space',
    passcode: 'EVA-CDR-01',
  },
  {
    id: 'usr-astro-02',
    name: 'PLT. Aria Patel',
    callsign: 'ISS-PLT-02',
    role: 'ASTRONAUT',
    assignedAstronautId: 'astro-02',
    missionRole: 'Orbital Pilot · Biomed Officer',
    email: 'aria.patel@astrocare.space',
    passcode: 'EVA-PLT-02',
  },
];

// --- Authoritative Crew State ---
const crewProfiles: Map<string, AstronautProfile> = new Map([
  [
    'astro-01',
    {
      id: 'astro-01',
      callsign: 'ISS-CDR-01',
      name: 'CDR. Marcus Chen',
      missionRole: 'Mission Commander · EVA-1 Lead',
      evaHours: 42.6,
      suitModel: 'xEMU-Mk IV #08',
      bloodType: 'O+',
      age: 39,
      mode: 'NORMAL',
      sosActive: false,
    },
  ],
  [
    'astro-02',
    {
      id: 'astro-02',
      callsign: 'ISS-PLT-02',
      name: 'PLT. Aria Patel',
      missionRole: 'Orbital Pilot · Biomed Officer',
      evaHours: 28.4,
      suitModel: 'xEMU-Mk IV #11',
      bloodType: 'A-',
      age: 34,
      mode: 'NORMAL',
      sosActive: false,
    },
  ],
  [
    'astro-03',
    {
      id: 'astro-03',
      callsign: 'ISS-MS-03',
      name: 'MS. Lukas Weber',
      missionRole: 'Mission Specialist · Habitation Systems',
      evaHours: 19.2,
      suitModel: 'xEMU-Mk IV #14',
      bloodType: 'B+',
      age: 36,
      mode: 'NORMAL',
      sosActive: false,
    },
  ],
]);

const telemetryHistory: Map<string, TelemetrySample[]> = new Map();
const anatomyMarkers: Map<string, AnatomyMarker[]> = new Map([
  [
    'astro-01',
    [
      {
        id: 'mkr-init-01',
        astronautId: 'astro-01',
        zone: 'PERIPHERAL_SUIT_SEAL',
        severity: 'amber',
        x: 73.5,
        y: 53.0,
        view: 'anterior',
        note: 'Right wrist bearing seal micro-torque friction noted during EVA airlock prep.',
        createdBy: 'Dr. Elena Vance',
        createdAt: Date.now() - 1000 * 60 * 24,
      },
    ],
  ],
  ['astro-02', []],
  ['astro-03', []],
]);

const sosEvents: SosEvent[] = [];

// Physiological simulation baselines and target profiles
const MODE_TARGETS: Record<
  SimulatorMode,
  {
    hr: [number, number];
    spo2: [number, number];
    temp: [number, number];
    sys: [number, number];
    dia: [number, number];
    resp: [number, number];
    suitP: [number, number];
    co2: [number, number];
    rad: [number, number];
    hrv: [number, number];
  }
> = {
  NORMAL: {
    hr: [66, 76],
    spo2: [98.0, 99.6],
    temp: [36.6, 37.0],
    sys: [115, 124],
    dia: [73, 81],
    resp: [13, 16],
    suitP: [29.4, 29.8],
    co2: [1.8, 2.7],
    rad: [0.04, 0.08],
    hrv: [54, 72],
  },
  WARNING: {
    hr: [108, 126],
    spo2: [92.0, 94.3],
    temp: [37.7, 38.2],
    sys: [142, 155],
    dia: [89, 96],
    resp: [21, 25],
    suitP: [26.8, 27.9],
    co2: [4.8, 6.2],
    rad: [0.22, 0.36],
    hrv: [28, 38],
  },
  CRITICAL: {
    hr: [148, 172],
    spo2: [84.5, 88.8],
    temp: [38.9, 39.7],
    sys: [168, 188],
    dia: [102, 114],
    resp: [29, 36],
    suitP: [21.5, 24.2],
    co2: [7.8, 10.4],
    rad: [0.58, 0.92],
    hrv: [12, 20],
  },
  EVA_STRAIN: {
    hr: [124, 144],
    spo2: [93.2, 95.8],
    temp: [37.9, 38.6],
    sys: [148, 164],
    dia: [88, 95],
    resp: [24, 30],
    suitP: [25.2, 27.1],
    co2: [5.4, 7.1],
    rad: [0.34, 0.52],
    hrv: [21, 31],
  },
};

function randBetween(min: number, max: number, decimals = 1): number {
  const val = min + Math.random() * (max - min);
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function smoothStep(prev: number | undefined, targetRange: [number, number], decimals = 1, alpha = 0.42): number {
  const target = randBetween(targetRange[0], targetRange[1], decimals);
  if (prev === undefined) return target;
  const blended = prev + (target - prev) * alpha;
  const factor = Math.pow(10, decimals);
  return Math.round(blended * factor) / factor;
}

function evaluateBreaches(sample: Omit<TelemetrySample, 'breachedZones'>): BreachedZone[] {
  const breaches: BreachedZone[] = [];

  if (sample.heartRate >= 140 || sample.systolicBp >= 165) {
    breaches.push({
      zone: 'THORACIC_CARDIAC',
      severity: 'red',
      reason: `Tachycardia / Hypertensive surge (${sample.heartRate} BPM · ${sample.systolicBp}/${sample.diastolicBp} mmHg)`,
      metric: 'heartRate',
      value: `${sample.heartRate} BPM`,
    });
  } else if (sample.heartRate >= 105 || sample.systolicBp >= 140) {
    breaches.push({
      zone: 'THORACIC_CARDIAC',
      severity: 'amber',
      reason: `Elevated cardiac workload (${sample.heartRate} BPM · ${sample.systolicBp}/${sample.diastolicBp} mmHg)`,
      metric: 'heartRate',
      value: `${sample.heartRate} BPM`,
    });
  }

  if (sample.spo2 <= 89.5 || sample.co2Partial >= 7.5) {
    breaches.push({
      zone: 'PULMONARY',
      severity: 'red',
      reason: `Severe hypoxia / hypercapnia risk (SpO2 ${sample.spo2}% · CO2 ${sample.co2Partial} mmHg)`,
      metric: 'spo2',
      value: `${sample.spo2}%`,
    });
  } else if (sample.spo2 <= 94.5 || sample.co2Partial >= 4.5) {
    breaches.push({
      zone: 'PULMONARY',
      severity: 'amber',
      reason: `Reduced alveolar O2 / rising CO2 (SpO2 ${sample.spo2}% · CO2 ${sample.co2Partial} mmHg)`,
      metric: 'spo2',
      value: `${sample.spo2}%`,
    });
  }

  if (sample.radiationDose >= 0.5 || sample.coreTemp >= 38.8) {
    breaches.push({
      zone: 'CRANIAL_OCULAR',
      severity: 'red',
      reason: `Acute radiation / neuro-thermal stress (${sample.radiationDose} mSv/h · ${sample.coreTemp}°C)`,
      metric: 'radiationDose',
      value: `${sample.radiationDose} mSv/h`,
    });
  } else if (sample.radiationDose >= 0.2 || sample.coreTemp >= 37.6) {
    breaches.push({
      zone: 'CRANIAL_OCULAR',
      severity: 'amber',
      reason: `Elevated ocular radiation / thermal drift (${sample.radiationDose} mSv/h · ${sample.coreTemp}°C)`,
      metric: 'coreTemp',
      value: `${sample.coreTemp}°C`,
    });
  }

  if (sample.suitPressure <= 24.5) {
    breaches.push({
      zone: 'PERIPHERAL_SUIT_SEAL',
      severity: 'red',
      reason: `Suit depressurization threshold breach (${sample.suitPressure} kPa)`,
      metric: 'suitPressure',
      value: `${sample.suitPressure} kPa`,
    });
  } else if (sample.suitPressure <= 27.8 || sample.mode === 'EVA_STRAIN') {
    breaches.push({
      zone: 'PERIPHERAL_SUIT_SEAL',
      severity: 'amber',
      reason: `EVA suit seal pressure variance (${sample.suitPressure} kPa)`,
      metric: 'suitPressure',
      value: `${sample.suitPressure} kPa`,
    });
  }

  return breaches;
}

function generateSample(astronautId: string, instantSnap = false): TelemetrySample {
  const profile = crewProfiles.get(astronautId);
  const mode: SimulatorMode = profile?.sosActive ? 'CRITICAL' : (profile?.mode ?? 'NORMAL');
  const targets = MODE_TARGETS[mode];
  const hist = telemetryHistory.get(astronautId) ?? [];
  const prev = instantSnap ? undefined : hist[hist.length - 1];
  const alpha = instantSnap ? 1 : 0.45;
  const now = Date.now();

  const raw = {
    astronautId,
    timestamp: now,
    isoTime: new Date(now).toISOString(),
    mode,
    heartRate: Math.round(smoothStep(prev?.heartRate, targets.hr, 0, alpha)),
    spo2: smoothStep(prev?.spo2, targets.spo2, 1, alpha),
    coreTemp: smoothStep(prev?.coreTemp, targets.temp, 2, alpha),
    systolicBp: Math.round(smoothStep(prev?.systolicBp, targets.sys, 0, alpha)),
    diastolicBp: Math.round(smoothStep(prev?.diastolicBp, targets.dia, 0, alpha)),
    respiratoryRate: Math.round(smoothStep(prev?.respiratoryRate, targets.resp, 0, alpha)),
    suitPressure: smoothStep(prev?.suitPressure, targets.suitP, 2, alpha),
    co2Partial: smoothStep(prev?.co2Partial, targets.co2, 2, alpha),
    radiationDose: smoothStep(prev?.radiationDose, targets.rad, 3, alpha),
    hrvMs: Math.round(smoothStep(prev?.hrvMs, targets.hrv, 0, alpha)),
  };

  const sample: TelemetrySample = {
    ...raw,
    breachedZones: evaluateBreaches(raw),
  };

  hist.push(sample);
  if (hist.length > 90) {
    hist.splice(0, hist.length - 90);
  }
  telemetryHistory.set(astronautId, hist);
  return sample;
}

// Seed initial 30 seconds of historical telemetry per astronaut so charts start populated with genuine data
for (const astroId of crewProfiles.keys()) {
  const now = Date.now();
  const seeded: TelemetrySample[] = [];
  for (let i = 29; i >= 0; i--) {
    const sample = generateSample(astroId);
    sample.timestamp = now - i * 1000;
    sample.isoTime = new Date(sample.timestamp).toISOString();
    seeded.push(sample);
  }
  telemetryHistory.set(astroId, seeded);
}

// --- STOMP 1.2 Broker over SockJS ---
interface StompSubscription {
  id: string;
  destination: string;
}

interface StompClientSession {
  conn: sockjs.Connection;
  connected: boolean;
  subscriptions: Map<string, StompSubscription>;
  buffer: string;
}

const stompSessions = new Set<StompClientSession>();
let messageCounter = 1;

function buildStompFrame(command: string, headers: Record<string, string>, body = ''): string {
  let frame = command + '\n';
  for (const [k, v] of Object.entries(headers)) {
    frame += `${k}:${v}\n`;
  }
  frame += '\n' + body + '\0';
  return frame;
}

function broadcastStomp(destination: string, payload: unknown) {
  const body = JSON.stringify(payload);
  for (const session of stompSessions) {
    if (!session.connected) continue;
    for (const sub of session.subscriptions.values()) {
      if (sub.destination === destination) {
        const frame = buildStompFrame(
          'MESSAGE',
          {
            destination,
            subscription: sub.id,
            'message-id': `msg-${messageCounter++}`,
            'content-type': 'application/json',
          },
          body
        );
        try {
          session.conn.write(frame);
        } catch {
          // Connection closing; handled by close listener
        }
      }
    }
  }
}

function applySimulatorMode(astronautId: string, mode: SimulatorMode) {
  const profile = crewProfiles.get(astronautId);
  if (!profile) return null;
  profile.mode = mode;
  if (mode === 'NORMAL' && profile.sosActive) {
    // Keep SOS independent unless explicitly acknowledged
  }
  const latest = generateSample(astronautId, true);
  broadcastStomp(`/topic/telemetry/${astronautId}`, latest);
  broadcastCrewSnapshot();
  return { profile, latest };
}

function triggerOrAckSos(params: {
  astronautId: string;
  active: boolean;
  note?: string;
  acknowledgedBy?: string;
}): SosEvent | null {
  const profile = crewProfiles.get(params.astronautId);
  if (!profile) return null;

  profile.sosActive = params.active;
  if (params.active) {
    profile.sosTimestamp = Date.now();
    profile.sosNote = params.note || 'Manual Emergency SOS Distress Beacon Activated';
    profile.mode = 'CRITICAL';
  } else {
    profile.sosNote = undefined;
    if (profile.mode === 'CRITICAL') {
      profile.mode = 'WARNING';
    }
  }

  const snapshot = generateSample(params.astronautId, true);

  let event: SosEvent;
  if (params.active) {
    event = {
      id: `sos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      astronautId: profile.id,
      astronautName: profile.name,
      callsign: profile.callsign,
      timestamp: Date.now(),
      active: true,
      note: profile.sosNote,
      vitalsSnapshot: snapshot,
    };
    sosEvents.unshift(event);
  } else {
    const existing = sosEvents.find((e) => e.astronautId === params.astronautId && e.active);
    if (existing) {
      existing.active = false;
      existing.acknowledgedBy = params.acknowledgedBy || 'Flight Surgeon';
      existing.acknowledgedAt = Date.now();
      event = existing;
    } else {
      event = {
        id: `sos-ack-${Date.now()}`,
        astronautId: profile.id,
        astronautName: profile.name,
        callsign: profile.callsign,
        timestamp: Date.now(),
        active: false,
        acknowledgedBy: params.acknowledgedBy || 'Flight Surgeon',
        acknowledgedAt: Date.now(),
        vitalsSnapshot: snapshot,
      };
    }
  }

  broadcastStomp('/topic/alerts', { type: 'SOS_UPDATE', event, profile, latest: snapshot });
  broadcastStomp(`/topic/telemetry/${params.astronautId}`, snapshot);
  broadcastCrewSnapshot();
  return event;
}

function broadcastCrewSnapshot() {
  const payload = Array.from(crewProfiles.values()).map((profile) => {
    const hist = telemetryHistory.get(profile.id) ?? [];
    return {
      profile,
      latest: hist[hist.length - 1],
      markers: anatomyMarkers.get(profile.id) ?? [],
    };
  });
  broadcastStomp('/topic/crew', { crew: payload, sosEvents: sosEvents.slice(0, 12) });
}

function handleStompFrame(session: StompClientSession, rawFrame: string) {
  const cleaned = rawFrame.replace(/^\r?\n+/, '');
  if (!cleaned) return;
  const headerEnd = cleaned.indexOf('\n\n');
  const crlfHeaderEnd = cleaned.indexOf('\r\n\r\n');
  let splitIdx = headerEnd;
  let sepLen = 2;
  if (headerEnd === -1 || (crlfHeaderEnd !== -1 && crlfHeaderEnd < headerEnd)) {
    splitIdx = crlfHeaderEnd;
    sepLen = 4;
  }

  const headerPart = splitIdx === -1 ? cleaned : cleaned.slice(0, splitIdx);
  const body = splitIdx === -1 ? '' : cleaned.slice(splitIdx + sepLen);
  const lines = headerPart.split(/\r?\n/);
  const command = lines[0]?.trim();
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx > 0) {
      const key = lines[i].slice(0, colonIdx).trim();
      const val = lines[i].slice(colonIdx + 1).trim();
      headers[key] = val;
    }
  }

  if (command === 'CONNECT' || command === 'STOMP') {
    session.connected = true;
    session.conn.write(
      buildStompFrame('CONNECTED', {
        version: '1.2',
        'heart-beat': '10000,10000',
        server: 'AstroCare-STOMP/1.2',
      })
    );
  } else if (command === 'SUBSCRIBE') {
    const id = headers['id'] || `sub-${Date.now()}`;
    const destination = headers['destination'];
    if (destination) {
      session.subscriptions.set(id, { id, destination });
      // Send immediate initial snapshot for subscribed destination
      if (destination.startsWith('/topic/telemetry/')) {
        const astronautId = destination.replace('/topic/telemetry/', '');
        const hist = telemetryHistory.get(astronautId);
        if (hist && hist.length > 0) {
          const frame = buildStompFrame(
            'MESSAGE',
            {
              destination,
              subscription: id,
              'message-id': `msg-${messageCounter++}`,
              'content-type': 'application/json',
            },
            JSON.stringify(hist[hist.length - 1])
          );
          session.conn.write(frame);
        }
      } else if (destination === '/topic/crew') {
        const payload = Array.from(crewProfiles.values()).map((profile) => {
          const hist = telemetryHistory.get(profile.id) ?? [];
          return {
            profile,
            latest: hist[hist.length - 1],
            markers: anatomyMarkers.get(profile.id) ?? [],
          };
        });
        const frame = buildStompFrame(
          'MESSAGE',
          {
            destination,
            subscription: id,
            'message-id': `msg-${messageCounter++}`,
            'content-type': 'application/json',
          },
          JSON.stringify({ crew: payload, sosEvents: sosEvents.slice(0, 12) })
        );
        session.conn.write(frame);
      }
    }
  } else if (command === 'UNSUBSCRIBE') {
    if (headers['id']) {
      session.subscriptions.delete(headers['id']);
    }
  } else if (command === 'SEND') {
    const dest = headers['destination'];
    try {
      const data = body ? JSON.parse(body) : {};
      if (dest === '/app/simulator/mode' && data.astronautId && data.mode) {
        applySimulatorMode(data.astronautId, data.mode);
      } else if (dest === '/app/sos' && data.astronautId !== undefined) {
        triggerOrAckSos(data);
      }
    } catch {
      // Ignore malformed JSON body
    }
  } else if (command === 'DISCONNECT') {
    if (headers['receipt']) {
      session.conn.write(buildStompFrame('RECEIPT', { 'receipt-id': headers['receipt'] }));
    }
    session.conn.close();
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- REST API Endpoints ---
  app.post('/api/auth/login', (req, res) => {
    const { role, email, passcode, callsign } = req.body as {
      role?: string;
      email?: string;
      passcode?: string;
      callsign?: string;
    };

    let matched = USERS.find(
      (u) =>
        (email && u.email.toLowerCase() === email.toLowerCase()) ||
        (callsign && u.callsign.toLowerCase() === callsign.toLowerCase())
    );

    if (!matched && role) {
      matched = USERS.find((u) => u.role === role);
    }

    if (!matched) {
      return res.status(401).json({ error: 'Invalid mission credentials or unrecognized callsign.' });
    }

    if (passcode && matched.passcode !== passcode.trim()) {
      return res.status(401).json({ error: 'Invalid mission authorization passcode.' });
    }

    const { passcode: _omitted, ...safeUser } = matched;
    const token = Buffer.from(`${safeUser.id}:${safeUser.role}:${Date.now()}`).toString('base64');

    return res.json({
      token,
      user: safeUser,
    });
  });

  app.get('/api/crew', (_req, res) => {
    const crew = Array.from(crewProfiles.values()).map((profile) => {
      const history = telemetryHistory.get(profile.id) ?? [];
      return {
        profile,
        latest: history[history.length - 1],
        history,
        markers: anatomyMarkers.get(profile.id) ?? [],
      };
    });
    res.json({ crew, sosEvents: sosEvents.slice(0, 20) });
  });

  app.get('/api/telemetry/:astronautId', (req, res) => {
    const { astronautId } = req.params;
    const profile = crewProfiles.get(astronautId);
    if (!profile) {
      return res.status(404).json({ error: 'Astronaut profile not found.' });
    }
    const history = telemetryHistory.get(astronautId) ?? [];
    res.json({
      profile,
      latest: history[history.length - 1],
      history,
    });
  });

  app.post('/api/simulator/mode', (req, res) => {
    const { astronautId, mode } = req.body as { astronautId: string; mode: SimulatorMode };
    if (!astronautId || !MODE_TARGETS[mode]) {
      return res.status(400).json({ error: 'Invalid astronautId or simulator mode.' });
    }
    const result = applySimulatorMode(astronautId, mode);
    if (!result) {
      return res.status(404).json({ error: 'Astronaut not found.' });
    }
    res.json(result);
  });

  app.post('/api/sos', (req, res) => {
    const { astronautId, active, note, acknowledgedBy } = req.body as {
      astronautId: string;
      active: boolean;
      note?: string;
      acknowledgedBy?: string;
    };
    const event = triggerOrAckSos({ astronautId, active: Boolean(active), note, acknowledgedBy });
    if (!event) {
      return res.status(404).json({ error: 'Astronaut not found.' });
    }
    res.json({ event });
  });

  app.get('/api/anatomy/markers/:astronautId', (req, res) => {
    const { astronautId } = req.params;
    if (!crewProfiles.has(astronautId)) {
      return res.status(404).json({ error: 'Astronaut not found.' });
    }
    res.json({ markers: anatomyMarkers.get(astronautId) ?? [] });
  });

  app.post('/api/anatomy/markers', (req, res) => {
    const {
      id,
      astronautId,
      zone,
      severity,
      x,
      y,
      view,
      note,
      createdBy,
      createdAt,
    } = req.body as Partial<AnatomyMarker>;

    if (!astronautId || !crewProfiles.has(astronautId)) {
      return res.status(404).json({ error: 'Astronaut profile not found.' });
    }
    if (!zone || typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ error: 'Marker requires zone and exact (x, y) coordinates.' });
    }

    const list = anatomyMarkers.get(astronautId) ?? [];
    const markerId = id || `mkr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Idempotency guard for IndexedDB offline sync retries
    const existing = list.find((m) => m.id === markerId);
    if (existing) {
      return res.status(200).json({ marker: existing, deduplicated: true });
    }

    const newMarker: AnatomyMarker = {
      id: markerId,
      astronautId,
      zone: zone as AnatomyZone,
      severity: (severity === 'red' ? 'red' : 'amber') as MarkerSeverity,
      x: Math.max(0, Math.min(100, Number(x.toFixed(1)))),
      y: Math.max(0, Math.min(100, Number(y.toFixed(1)))),
      view: view === 'posterior' ? 'posterior' : 'anterior',
      note: (note || 'Clinical anomaly pinned by Flight Surgeon.').trim(),
      createdBy: createdBy || 'Flight Surgeon',
      createdAt: createdAt || Date.now(),
      synced: true,
    };

    list.unshift(newMarker);
    anatomyMarkers.set(astronautId, list);

    broadcastStomp(`/topic/markers/${astronautId}`, {
      action: 'CREATE',
      marker: newMarker,
      markers: list,
    });
    broadcastCrewSnapshot();

    return res.status(201).json({ marker: newMarker });
  });

  app.delete('/api/anatomy/markers/:markerId', (req, res) => {
    const { markerId } = req.params;
    for (const [astroId, list] of anatomyMarkers.entries()) {
      const idx = list.findIndex((m) => m.id === markerId);
      if (idx !== -1) {
        const [removed] = list.splice(idx, 1);
        anatomyMarkers.set(astroId, list);
        broadcastStomp(`/topic/markers/${astroId}`, {
          action: 'DELETE',
          markerId: removed.id,
          markers: list,
        });
        broadcastCrewSnapshot();
        return res.json({ deleted: removed.id });
      }
    }
    return res.status(404).json({ error: 'Marker not found.' });
  });

  // --- Clinical PDF Export Endpoint ---
  app.get('/api/reports/pdf/:astronautId', (req, res) => {
    const { astronautId } = req.params;
    const profile = crewProfiles.get(astronautId);
    if (!profile) {
      return res.status(404).json({ error: 'Astronaut profile not found.' });
    }

    const history = telemetryHistory.get(astronautId) ?? [];
    const latest = history[history.length - 1];
    const markers = anatomyMarkers.get(astronautId) ?? [];
    const astroSos = sosEvents.filter((s) => s.astronautId === astronautId);

    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const filename = `AstroCare_Clinical_Report_${profile.callsign}_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 84).fill('#07090E');
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('ASTROCARE CLINICAL TELEMETRY REPORT', 48, 24);
    doc
      .fillColor('#94A3B8')
      .fontSize(9)
      .font('Helvetica')
      .text(
        `GENERATED: ${new Date().toUTCString()}   |   CALLSIGN: ${profile.callsign}   |   SUIT: ${profile.suitModel}`,
        48,
        52
      );

    doc.moveDown(3);
    doc.fillColor('#0F172A');

    // Astronaut Profile Summary
    doc.fontSize(13).font('Helvetica-Bold').text('1. Crew Member & Mission Profile', 48, 108);
    doc.moveTo(48, 126).lineTo(547, 126).strokeColor('#CBD5E1').lineWidth(0.75).stroke();

    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    doc.text(`Subject Name: ${profile.name}`, 48, 136);
    doc.text(`Mission Role: ${profile.missionRole}`, 48, 152);
    doc.text(`Blood Type: ${profile.bloodType}   |   Age: ${profile.age} yrs   |   Cumulative EVA: ${profile.evaHours} hrs`, 48, 168);
    doc.text(`Active Physiological State: ${profile.mode}   |   SOS Beacon: ${profile.sosActive ? 'ACTIVE' : 'CLEAR'}`, 48, 184);

    // Current Biometric Snapshot
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('2. Current Telemetry Snapshot', 48, 214);
    doc.moveTo(48, 232).lineTo(547, 232).strokeColor('#CBD5E1').stroke();

    if (latest) {
      const vitalsRows = [
        ['Heart Rate', `${latest.heartRate} BPM`, 'Normal: 60 - 100 BPM'],
        ['Blood Oxygen (SpO2)', `${latest.spo2} %`, 'Normal: 95.0 - 100 %'],
        ['Core Body Temperature', `${latest.coreTemp} °C`, 'Normal: 36.4 - 37.5 °C'],
        ['Blood Pressure (SYS/DIA)', `${latest.systolicBp} / ${latest.diastolicBp} mmHg`, 'Normal: < 135 / 85 mmHg'],
        ['Respiratory Rate', `${latest.respiratoryRate} br/min`, 'Normal: 12 - 20 br/min'],
        ['Suit Pressure (xEMU)', `${latest.suitPressure} kPa`, 'Nominal: 29.0 - 30.2 kPa'],
        ['CO2 Partial Pressure', `${latest.co2Partial} mmHg`, 'Nominal: < 4.0 mmHg'],
        ['Radiation Dose Rate', `${latest.radiationDose} mSv/h`, 'Nominal: < 0.15 mSv/h'],
      ];

      let yPos = 244;
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#475569');
      doc.text('PARAMETER', 48, yPos);
      doc.text('CURRENT VALUE', 240, yPos);
      doc.text('CLINICAL REFERENCE', 370, yPos);
      yPos += 16;

      doc.font('Helvetica').fillColor('#0F172A');
      for (const [label, val, ref] of vitalsRows) {
        doc.text(label, 48, yPos);
        doc.font('Helvetica-Bold').text(val, 240, yPos);
        doc.font('Helvetica').fillColor('#64748B').text(ref, 370, yPos);
        doc.fillColor('#0F172A');
        yPos += 17;
      }

      // Active Telemetry Breaches
      yPos += 10;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('3. Automated Node Threshold Breaches', 48, yPos);
      yPos += 18;
      doc.moveTo(48, yPos).lineTo(547, yPos).strokeColor('#CBD5E1').stroke();
      yPos += 10;

      doc.fontSize(9.5).font('Helvetica');
      if (latest.breachedZones.length === 0) {
        doc.fillColor('#059669').text('No active physiological or suit telemetry breaches detected.', 48, yPos);
        yPos += 18;
      } else {
        for (const b of latest.breachedZones) {
          doc
            .fillColor(b.severity === 'red' ? '#DC2626' : '#D97706')
            .font('Helvetica-Bold')
            .text(`[${b.severity.toUpperCase()}] ${b.zone}:`, 48, yPos);
          doc.fillColor('#1E293B').font('Helvetica').text(b.reason, 210, yPos, { width: 335 });
          yPos += 22;
        }
      }

      // Anatomical Markers
      yPos += 10;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('4. Pinned Anatomical Anomaly Markers', 48, yPos);
      yPos += 18;
      doc.moveTo(48, yPos).lineTo(547, yPos).strokeColor('#CBD5E1').stroke();
      yPos += 10;

      doc.fontSize(9.5).font('Helvetica');
      if (markers.length === 0) {
        doc.fillColor('#64748B').text('No anatomical anomaly markers pinned for this crew member.', 48, yPos);
        yPos += 18;
      } else {
        for (const m of markers.slice(0, 8)) {
          doc
            .fillColor(m.severity === 'red' ? '#DC2626' : '#D97706')
            .font('Helvetica-Bold')
            .text(`[${m.severity.toUpperCase()}] ${m.zone} (${m.view}, X:${m.x}%, Y:${m.y}%)`, 48, yPos);
          yPos += 13;
          doc
            .fillColor('#334155')
            .font('Helvetica')
            .text(`${m.note} — Logged by ${m.createdBy} at ${new Date(m.createdAt).toUTCString()}`, 58, yPos, {
              width: 485,
            });
          yPos += 22;
        }
      }

      // SOS History
      if (yPos < 700) {
        yPos += 8;
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('5. Emergency SOS Event Log', 48, yPos);
        yPos += 18;
        doc.moveTo(48, yPos).lineTo(547, yPos).strokeColor('#CBD5E1').stroke();
        yPos += 10;
        doc.fontSize(9.5).font('Helvetica');
        if (astroSos.length === 0) {
          doc.fillColor('#64748B').text('Zero SOS distress events recorded during current mission epoch.', 48, yPos);
        } else {
          for (const ev of astroSos.slice(0, 5)) {
            const statusText = ev.active
              ? 'ACTIVE DISTRESS'
              : `ACKNOWLEDGED by ${ev.acknowledgedBy ?? 'Flight Surgeon'}`;
            doc
              .fillColor(ev.active ? '#DC2626' : '#334155')
              .text(
                `${new Date(ev.timestamp).toUTCString()} — ${statusText} — ${ev.note ?? 'SOS Beacon'}`,
                48,
                yPos,
                { width: 495 }
              );
            yPos += 18;
          }
        }
      }
    }

    doc.end();
  });

  // Create HTTP server wrapping Express
  const httpServer = http.createServer(app);

  // Install SockJS server BEFORE Vite middleware so /ws-telemetry is intercepted cleanly
  const sockjsServer = sockjs.createServer({
    prefix: '/ws-telemetry',
    log: () => {},
  });

  sockjsServer.on('connection', (conn) => {
    const session: StompClientSession = {
      conn,
      connected: false,
      subscriptions: new Map(),
      buffer: '',
    };
    stompSessions.add(session);

    conn.on('data', (chunk: string) => {
      session.buffer += chunk;
      let nullIdx = session.buffer.indexOf('\0');
      while (nullIdx !== -1) {
        const rawFrame = session.buffer.slice(0, nullIdx);
        session.buffer = session.buffer.slice(nullIdx + 1);
        handleStompFrame(session, rawFrame);
        nullIdx = session.buffer.indexOf('\0');
      }
    });

    conn.on('close', () => {
      stompSessions.delete(session);
    });
  });

  sockjsServer.installHandlers(httpServer, { prefix: '/ws-telemetry' });

  // 1Hz Live Physiological Telemetry Loop broadcast over STOMP
  setInterval(() => {
    for (const astroId of crewProfiles.keys()) {
      const sample = generateSample(astroId);
      broadcastStomp(`/topic/telemetry/${astroId}`, sample);
    }
    broadcastCrewSnapshot();
  }, 1000);

  // Mount Vite dev middleware or static dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AstroCare mission control & SockJS/STOMP server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
