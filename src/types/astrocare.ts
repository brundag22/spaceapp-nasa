export type UserRole = 'FLIGHT_SURGEON' | 'ASTRONAUT';

export type SimulatorMode = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EVA_STRAIN';

export type AnatomyZone =
  | 'CRANIAL_OCULAR'
  | 'THORACIC_CARDIAC'
  | 'PULMONARY'
  | 'PERIPHERAL_SUIT_SEAL';

export type MarkerSeverity = 'amber' | 'red';

export type TelemetryMetricKey =
  | 'heartRate'
  | 'spo2'
  | 'coreTemp'
  | 'systolicBp'
  | 'suitPressure'
  | 'co2Partial'
  | 'radiationDose';

export interface BreachedZone {
  zone: AnatomyZone;
  severity: MarkerSeverity;
  reason: string;
  metric: TelemetryMetricKey;
  value: string;
}

export interface TelemetrySample {
  astronautId: string;
  timestamp: number;
  isoTime: string;
  mode: SimulatorMode;
  heartRate: number;
  spo2: number;
  coreTemp: number;
  systolicBp: number;
  diastolicBp: number;
  respiratoryRate: number;
  suitPressure: number;
  co2Partial: number;
  radiationDose: number;
  hrvMs: number;
  breachedZones: BreachedZone[];
}

export interface AstronautProfile {
  id: string;
  callsign: string;
  name: string;
  missionRole: string;
  evaHours: number;
  suitModel: string;
  bloodType: string;
  age: number;
  mode: SimulatorMode;
  sosActive: boolean;
  sosTimestamp?: number;
  sosNote?: string;
}

export interface AnatomyMarker {
  id: string;
  astronautId: string;
  zone: AnatomyZone;
  severity: MarkerSeverity;
  x: number;
  y: number;
  view: 'anterior' | 'posterior';
  note: string;
  createdBy: string;
  createdAt: number;
  synced?: boolean;
}

export interface SosEvent {
  id: string;
  astronautId: string;
  astronautName: string;
  callsign: string;
  timestamp: number;
  active: boolean;
  note?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  vitalsSnapshot: TelemetrySample;
}

export interface AuthUser {
  id: string;
  name: string;
  callsign: string;
  role: UserRole;
  assignedAstronautId?: string;
  missionRole: string;
  email: string;
}

export interface CrewTelemetryState {
  profile: AstronautProfile;
  latest: TelemetrySample;
  history: TelemetrySample[];
  markers: AnatomyMarker[];
}
