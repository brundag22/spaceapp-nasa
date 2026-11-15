import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { TelemetryMetricKey, TelemetrySample } from '../types/astrocare';

interface VitalCardsGridProps {
  latest: TelemetrySample | undefined;
  history: TelemetrySample[];
  onSelectMetric: (metric: TelemetryMetricKey) => void;
}

interface VitalConfig {
  key: TelemetryMetricKey;
  label: string;
  unit: string;
  getValue: (s: TelemetrySample) => string;
  getNumeric: (s: TelemetrySample) => number;
  getStatus: (s: TelemetrySample) => 'nominal' | 'warning' | 'critical';
  refRange: string;
  strokeColor: string;
}

const VITAL_CONFIGS: VitalConfig[] = [
  {
    key: 'heartRate',
    label: 'Heart Rate',
    unit: 'BPM',
    getValue: (s) => `${s.heartRate}`,
    getNumeric: (s) => s.heartRate,
    getStatus: (s) => (s.heartRate >= 140 ? 'critical' : s.heartRate >= 105 ? 'warning' : 'nominal'),
    refRange: '60 - 100 BPM · QRS Sync',
    strokeColor: '#06B6D4',
  },
  {
    key: 'spo2',
    label: 'Blood Oxygen (SpO2)',
    unit: '%',
    getValue: (s) => s.spo2.toFixed(1),
    getNumeric: (s) => s.spo2,
    getStatus: (s) => (s.spo2 <= 89.5 ? 'critical' : s.spo2 <= 94.5 ? 'warning' : 'nominal'),
    refRange: '95.0 - 100.0 %',
    strokeColor: '#10B981',
  },
  {
    key: 'coreTemp',
    label: 'Core Body Temp',
    unit: '°C',
    getValue: (s) => s.coreTemp.toFixed(2),
    getNumeric: (s) => s.coreTemp,
    getStatus: (s) => (s.coreTemp >= 38.8 ? 'critical' : s.coreTemp >= 37.6 ? 'warning' : 'nominal'),
    refRange: '36.40 - 37.50 °C',
    strokeColor: '#F59E0B',
  },
  {
    key: 'systolicBp',
    label: 'Arterial Pressure',
    unit: 'mmHg',
    getValue: (s) => `${s.systolicBp}/${s.diastolicBp}`,
    getNumeric: (s) => s.systolicBp,
    getStatus: (s) => (s.systolicBp >= 165 ? 'critical' : s.systolicBp >= 140 ? 'warning' : 'nominal'),
    refRange: '110/70 - 135/85 mmHg',
    strokeColor: '#3B82F6',
  },
  {
    key: 'suitPressure',
    label: 'xEMU Suit Pressure',
    unit: 'kPa',
    getValue: (s) => s.suitPressure.toFixed(2),
    getNumeric: (s) => s.suitPressure,
    getStatus: (s) => (s.suitPressure <= 24.5 ? 'critical' : s.suitPressure <= 27.8 ? 'warning' : 'nominal'),
    refRange: '29.00 - 30.20 kPa',
    strokeColor: '#8B5CF6',
  },
  {
    key: 'co2Partial',
    label: 'CO2 Partial Pressure',
    unit: 'mmHg',
    getValue: (s) => s.co2Partial.toFixed(2),
    getNumeric: (s) => s.co2Partial,
    getStatus: (s) => (s.co2Partial >= 7.5 ? 'critical' : s.co2Partial >= 4.5 ? 'warning' : 'nominal'),
    refRange: '< 4.00 mmHg · Rad ' + '',
    strokeColor: '#EC4899',
  },
];

function buildSparklinePoints(values: number[], width = 140, height = 34): string {
  if (values.length < 2) return `0,${height / 2} ${width},${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * width;
      const y = height - 4 - ((v - min) / span) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export const VitalCardsGrid: React.FC<VitalCardsGridProps> = ({
  latest,
  history,
  onSelectMetric,
}) => {
  const recent = history.slice(-24);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {VITAL_CONFIGS.map((cfg) => {
        const status = latest ? cfg.getStatus(latest) : 'nominal';
        const statusMeta =
          status === 'critical'
            ? { label: '✖ Critical', cls: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/60' }
            : status === 'warning'
              ? { label: '▲ Elevated', cls: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/60' }
              : { label: '● Nominal', cls: 'text-emerald-600 dark:text-emerald-400', border: '' };

        const sparkValues = recent.map(cfg.getNumeric);
        const points = buildSparklinePoints(sparkValues);

        return (
          <button
            key={cfg.key}
            type="button"
            onClick={() => onSelectMetric(cfg.key)}
            aria-label={`Inspect ${cfg.label} Elevated Trend and Waveform`}
            className={`group text-left astro-glass rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-cyan-500/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${statusMeta.border}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {cfg.label}
              </span>
              <span className={`font-mono-tabular text-xs font-semibold ${statusMeta.cls}`}>
                {statusMeta.label}
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="flex items-baseline">
                <span className="font-mono-tabular text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {latest ? cfg.getValue(latest) : '--'}
                </span>
                <span className="ml-1.5 font-mono-tabular text-xs font-medium text-slate-500 dark:text-slate-400">
                  {cfg.unit}
                </span>
              </div>

              <svg
                width="120"
                height="34"
                viewBox="0 0 140 34"
                aria-hidden="true"
                className="shrink-0 overflow-visible"
              >
                <polyline
                  fill="none"
                  stroke={status === 'critical' ? '#F43F5E' : status === 'warning' ? '#F59E0B' : cfg.strokeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              </svg>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono-tabular truncate">
                {cfg.key === 'co2Partial' && latest
                  ? `< 4.00 mmHg · Rad ${latest.radiationDose.toFixed(2)} mSv/h`
                  : cfg.refRange}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-cyan-600 dark:text-cyan-400 opacity-85 group-hover:opacity-100 whitespace-nowrap shrink-0">
                <Maximize2 className="h-3 w-3" />
                <span>ECG / Trend</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
