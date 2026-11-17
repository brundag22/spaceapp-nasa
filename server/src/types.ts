import type { Request } from 'express';

export type RoleName = 'ROLE_FLIGHT_SURGEON' | 'ROLE_ASTRONAUT';
export type SimulationMode = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EVA_STRAIN';
export type AlertSeverity = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface AuthUser {
  userId: number;
  email: string;
  displayName: string;
  role: RoleName;
  astronautId: number | null;
  sessionTokenHash: string;
  csrfHash: string;
}

export type AuthenticatedRequest = Request & { auth?: AuthUser };

export interface VitalReading {
  id?: number;
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
  auxSignals: {
    ocularMisalignmentDeg: number;
    cephalicFluidShiftIndex: number;
  };
  recordedAt: string;
  mode: SimulationMode;
}
