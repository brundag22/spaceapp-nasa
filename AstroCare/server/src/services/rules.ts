import type { AlertSeverity, SimulationMode, VitalReading } from '../types.js';

export interface RuleFlag {
  category: string;
  title: string;
  description: string;
  bodyZone: string;
  severity: Exclude<AlertSeverity, 'GREEN'>;
}

// Demonstration-only values. These are not NASA-calibrated or clinical thresholds.
export const DEMO_THRESHOLDS = {
  spo2: { redBelow: 90, yellowBelow: 94 },
  heartRate: { redAbove: 135, redBelow: 45, yellowAbove: 112, yellowBelow: 52 },
  evaSuitPressurePsi: { redBelow: 2.4, orangeBelow: 3.3 },
  radiationMsvH: { orangeAbove: 0.9 },
  coreTemperatureC: { redAtOrAbove: 38.4, yellowAtOrAbove: 37.8 },
  sans: { cephalicFluidShiftIndexAtOrAbove: 0.72, ocularMisalignmentDegAtOrAbove: 1.8 },
} as const;

export function evaluateReading(reading: VitalReading, mode: SimulationMode): RuleFlag[] {
  const flags: RuleFlag[] = [];
  const push = (flag: RuleFlag) => flags.push(flag);
  const threshold = DEMO_THRESHOLDS;

  if (reading.spo2 < threshold.spo2.redBelow) {
    push({ category: 'HYPOXIA', title: 'Oxygen saturation below demo threshold', description: `SpO2 ${reading.spo2.toFixed(1)}% is below the configured demonstration threshold.`, bodyZone: 'PULMONARY', severity: 'RED' });
  } else if (reading.spo2 < threshold.spo2.yellowBelow) {
    push({ category: 'HYPOXIA', title: 'Oxygen saturation trend', description: `SpO2 ${reading.spo2.toFixed(1)}% is approaching the configured demonstration threshold.`, bodyZone: 'PULMONARY', severity: 'YELLOW' });
  }

  if (reading.heartRate > threshold.heartRate.redAbove || reading.heartRate < threshold.heartRate.redBelow) {
    push({ category: 'CARDIAC_STRAIN', title: 'Cardiac strain rule flag', description: `Heart rate ${reading.heartRate.toFixed(0)} bpm is outside the demo rule band.`, bodyZone: 'THORACIC_CARDIAC', severity: 'RED' });
  } else if (reading.heartRate > threshold.heartRate.yellowAbove || reading.heartRate < threshold.heartRate.yellowBelow) {
    push({ category: 'CARDIAC_STRAIN', title: 'Heart-rate trend requires review', description: `Heart rate ${reading.heartRate.toFixed(0)} bpm crossed a configurable demo trend line.`, bodyZone: 'THORACIC_CARDIAC', severity: 'YELLOW' });
  }

  if (reading.evaSuitPressurePsi < threshold.evaSuitPressurePsi.redBelow) {
    push({ category: 'DECOMPRESSION_RISK', title: 'EVA suit pressure drop', description: `Suit pressure ${reading.evaSuitPressurePsi.toFixed(1)} PSI crossed the simulated EVA threshold.`, bodyZone: 'PERIPHERAL_SUIT', severity: 'RED' });
  } else if (reading.evaSuitPressurePsi < threshold.evaSuitPressurePsi.orangeBelow) {
    push({ category: 'DECOMPRESSION_RISK', title: 'EVA suit pressure trend', description: `Suit pressure ${reading.evaSuitPressurePsi.toFixed(1)} PSI is below the configured demonstration band.`, bodyZone: 'PERIPHERAL_SUIT', severity: 'ORANGE' });
  }

  if (reading.radiationMsvH > threshold.radiationMsvH.orangeAbove) {
    push({ category: 'RADIATION_SPIKE', title: 'Radiation-rate spike', description: `Radiation ${reading.radiationMsvH.toFixed(2)} mSv/h crossed the demo rule line.`, bodyZone: 'PERIPHERAL_SUIT', severity: 'ORANGE' });
  }

  if (reading.coreTemperatureC >= threshold.coreTemperatureC.redAtOrAbove) {
    push({ category: 'THERMAL_STRESS', title: 'Thermal stress rule flag', description: `Core temperature ${reading.coreTemperatureC.toFixed(1)} °C crossed the configurable demo line.`, bodyZone: 'THORACIC_CHEST', severity: 'RED' });
  } else if (reading.coreTemperatureC >= threshold.coreTemperatureC.yellowAtOrAbove) {
    push({ category: 'THERMAL_STRESS', title: 'Core temperature trend', description: `Core temperature ${reading.coreTemperatureC.toFixed(1)} °C entered the demo review band.`, bodyZone: 'THORACIC_CHEST', severity: 'YELLOW' });
  }

  if (reading.auxSignals.cephalicFluidShiftIndex >= threshold.sans.cephalicFluidShiftIndexAtOrAbove
    || reading.auxSignals.ocularMisalignmentDeg >= threshold.sans.ocularMisalignmentDegAtOrAbove) {
    push({ category: 'SANS_PATTERN', title: 'SANS / cephalic fluid-shift pattern', description: 'Synthetic ocular/fluid-shift indicators triggered a configurable demo rule. This flag is not a diagnosis.', bodyZone: 'CRANIAL_OCULAR', severity: mode === 'CRITICAL' ? 'RED' : 'ORANGE' });
  }

  return flags;
}

export function overallSeverity(flags: RuleFlag[]): AlertSeverity {
  if (flags.some((flag) => flag.severity === 'RED')) return 'RED';
  if (flags.some((flag) => flag.severity === 'ORANGE')) return 'ORANGE';
  if (flags.some((flag) => flag.severity === 'YELLOW')) return 'YELLOW';
  return 'GREEN';
}
