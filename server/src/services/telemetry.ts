import type { RowDataPacket } from 'mysql2/promise';
import type { SimulationMode, VitalReading } from '../types.js';

export interface CrewBaseline extends RowDataPacket {
  astronaut_id: number;
  call_sign: string;
  first_name: string;
  last_name: string;
  mode: SimulationMode;
  heart_rate: number;
  spo2: number;
  systolic_bp: number;
  diastolic_bp: number;
  core_temperature_c: number;
  respiratory_rate: number;
  eva_suit_pressure_psi: number;
  radiation_msv_h: number;
}

const jitter = (amount: number) => (Math.random() * 2 - 1) * amount;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function ecg(seed: number): number[] {
  return Array.from({ length: 80 }, (_, i) => {
    const phase = (i + seed) % 20;
    const noise = Math.sin((i + seed) * 0.42) * 0.025;
    const p = phase === 4 ? 0.12 : phase === 5 ? 0.07 : 0;
    const qrs = phase === 9 ? -0.12 : phase === 10 ? 0.96 : phase === 11 ? -0.22 : 0;
    const t = phase === 15 ? 0.24 : phase === 16 ? 0.1 : 0;
    return Number((noise + p + qrs + t).toFixed(3));
  });
}

export function makeReading(baseline: CrewBaseline): VitalReading {
  const mode = baseline.mode;
  const extreme = mode === 'CRITICAL';
  const eva = mode === 'EVA_STRAIN';
  const warning = mode === 'WARNING';
  const hr = extreme ? 146 : eva ? 128 : warning ? 115 : Number(baseline.heart_rate);
  const spo2 = extreme ? 86 : eva ? 94 : warning ? 92.5 : Number(baseline.spo2);
  const systolic = extreme ? 162 : eva ? 148 : warning ? 142 : Number(baseline.systolic_bp);
  const diastolic = extreme ? 104 : eva ? 92 : warning ? 90 : Number(baseline.diastolic_bp);
  const temperature = extreme ? 38.6 : eva ? 38.0 : warning ? 37.9 : Number(baseline.core_temperature_c);
  const respiration = extreme ? 30 : eva ? 28 : warning ? 24 : Number(baseline.respiratory_rate);
  const suitPressure = extreme ? 2.8 : eva ? 1.9 : Number(baseline.eva_suit_pressure_psi);
  const radiation = extreme ? 1.12 : Number(baseline.radiation_msv_h);
  const ocularMisalignmentDeg = extreme ? 2.1 + Math.random() * 0.3 : warning ? 0.6 : 0.2;
  const cephalicFluidShiftIndex = extreme ? 0.82 + Math.random() * 0.08 : warning ? 0.35 : 0.18;

  return {
    astronautId: Number(baseline.astronaut_id),
    heartRate: Math.round(clamp(hr + jitter(extreme ? 4 : 3), 38, 175)),
    spo2: Number(clamp(spo2 + jitter(0.8), 75, 100).toFixed(1)),
    systolicBp: Math.round(clamp(systolic + jitter(4), 80, 210)),
    diastolicBp: Math.round(clamp(diastolic + jitter(3), 40, 130)),
    coreTemperatureC: Number(clamp(temperature + jitter(0.12), 35, 41).toFixed(2)),
    respiratoryRate: Number(clamp(respiration + jitter(1), 6, 45).toFixed(1)),
    ecgLeadIi: ecg(Math.floor(Math.random() * 20)),
    evaSuitPressurePsi: Number(clamp(suitPressure + jitter(eva || extreme ? 0.12 : 0.04), 0.5, 6).toFixed(2)),
    radiationMsvH: Number(clamp(radiation + jitter(extreme ? 0.04 : 0.02), 0.01, 2.5).toFixed(3)),
    auxSignals: {
      ocularMisalignmentDeg: Number(ocularMisalignmentDeg.toFixed(2)),
      cephalicFluidShiftIndex: Number(cephalicFluidShiftIndex.toFixed(2)),
    },
    recordedAt: new Date().toISOString(),
    mode,
  };
}
