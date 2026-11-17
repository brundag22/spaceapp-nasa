export type RoleName = 'ROLE_FLIGHT_SURGEON' | 'ROLE_ASTRONAUT';
export type Mode = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EVA_STRAIN';
export type Severity = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: RoleName;
  astronautId: number | null;
}
export interface VitalReading {
  id: number;
  astronautId: number;
  heartRate: number;
  spo2: number;
  systolicBp: number;
  diastolicBp: number;
  coreTemperatureC: number;
  respiratoryRate: number;
  ecgLeadIi: number[];
  evaSuitPressurePsi: number;
  radiationMsvH: number;
  auxSignals: { ocularMisalignmentDeg: number; cephalicFluidShiftIndex: number };
  recordedAt: string;
  mode: Mode;
}
export interface Alert {
  id: number;
  astronautId: number;
  category: string;
  title: string;
  description: string;
  bodyZone: string;
  severity: Exclude<Severity, 'GREEN'>;
  status: string;
  createdAt: string;
}
export interface Astronaut {
  id: number;
  userId: number | null;
  callSign: string;
  firstName: string;
  lastName: string;
  title: string;
  status: string;
  avatarTone: string;
  missionName: string;
  missionPhase: string;
  mode: Mode;
  severity: Severity;
  latest: VitalReading | null;
  alertCount: number;
}
export interface Marker {
  id: number;
  astronautId: number;
  createdBy: number;
  bodyZone: string;
  coordX: number;
  coordY: number;
  severity: Exclude<Severity, 'GREEN'>;
  clinicalNote: string;
  resolved: boolean;
  createdAt: string;
}

let csrfToken = '';
export function setCsrfToken(token: string) { csrfToken = token; }

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (csrfToken && options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
    throw new ApiError(payload.error ?? `Request failed (${response.status})`, response.status, payload.code);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) return await response.blob() as T;
  return await response.json() as T;
}

export function formatClock(date: string | Date): string {
  const value = new Date(date);
  return value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }) + ' Z';
}

export function formatRelative(date: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
