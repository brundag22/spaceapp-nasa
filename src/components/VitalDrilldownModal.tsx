import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Pause, Play, X } from 'lucide-react';
import type { AstronautProfile, TelemetryMetricKey, TelemetrySample } from '../types/astrocare';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend
);

interface VitalDrilldownModalProps {
  metric: TelemetryMetricKey;
  astronaut: AstronautProfile;
  latest: TelemetrySample | undefined;
  history: TelemetrySample[];
  theme: 'dark' | 'light';
  onSelectMetric: (metric: TelemetryMetricKey) => void;
  onClose: () => void;
}

const METRIC_META: Record<
  TelemetryMetricKey,
  {
    label: string;
    unit: string;
    extract: (s: TelemetrySample) => number;
    warnThreshold: number;
    critThreshold: number;
    invertThreshold?: boolean;
    waveformTitle: string;
    color: string;
  }
> = {
  heartRate: {
    label: 'Heart Rate',
    unit: 'BPM',
    extract: (s) => s.heartRate,
    warnThreshold: 105,
    critThreshold: 140,
    waveformTitle: 'Lead-II QRS ECG Waveform (Live Beat-Synced)',
    color: '#06B6D4',
  },
  spo2: {
    label: 'Blood Oxygen (SpO2)',
    unit: '%',
    extract: (s) => s.spo2,
    warnThreshold: 94.5,
    critThreshold: 89.5,
    invertThreshold: true,
    waveformTitle: 'Photoplethysmogram (PPG) & QRS Reference',
    color: '#10B981',
  },
  coreTemp: {
    label: 'Core Body Temp',
    unit: '°C',
    extract: (s) => s.coreTemp,
    warnThreshold: 37.6,
    critThreshold: 38.8,
    waveformTitle: 'Thermal Telemetry + Lead-II QRS Reference',
    color: '#F59E0B',
  },
  systolicBp: {
    label: 'Systolic Arterial Pressure',
    unit: 'mmHg',
    extract: (s) => s.systolicBp,
    warnThreshold: 140,
    critThreshold: 165,
    waveformTitle: 'Arterial Pressure Pulse Wave & QRS Sync',
    color: '#3B82F6',
  },
  suitPressure: {
    label: 'xEMU Suit Pressure',
    unit: 'kPa',
    extract: (s) => s.suitPressure,
    warnThreshold: 27.8,
    critThreshold: 24.5,
    invertThreshold: true,
    waveformTitle: 'Suit Manifold Pressure Trace & QRS Reference',
    color: '#8B5CF6',
  },
  co2Partial: {
    label: 'CO2 Partial Pressure',
    unit: 'mmHg',
    extract: (s) => s.co2Partial,
    warnThreshold: 4.5,
    critThreshold: 7.5,
    waveformTitle: 'Capnography CO2 Waveform & QRS Reference',
    color: '#EC4899',
  },
  radiationDose: {
    label: 'Radiation Dose Rate',
    unit: 'mSv/h',
    extract: (s) => s.radiationDose,
    warnThreshold: 0.2,
    critThreshold: 0.5,
    waveformTitle: 'Dosimeter Flux & QRS Reference',
    color: '#F97316',
  },
};

/**
 * Synthesizes an authentic P-QRS-T cardiac complex voltage at cycle phase u in [0, 1).
 */
function samplePqrst(u: number, stressFactor: number): number {
  const gaussian = (center: number, width: number, amp: number) =>
    amp * Math.exp(-Math.pow((u - center) / width, 2));

  // P wave, Q dip, sharp R peak, S dip, T wave (with ST depression/elevation under stress)
  const pWave = gaussian(0.16, 0.032, 0.14);
  const qDip = gaussian(0.27, 0.011, -0.16);
  const rPeak = gaussian(0.30, 0.013, 1.15);
  const sDip = gaussian(0.335, 0.013, -0.28);
  const stShift = stressFactor > 0.4 ? gaussian(0.41, 0.04, -0.14 * stressFactor) : 0;
  const tWave = gaussian(0.52, 0.052, 0.28 + 0.1 * stressFactor);
  const microNoise = (Math.random() - 0.5) * (0.015 + 0.025 * stressFactor);
  return pWave + qDip + rPeak + sDip + stShift + tWave + microNoise;
}

/**
 * Synthesizes arterial/PPG dicrotic notch pulse wave synced to cardiac cycle phase u in [0, 1).
 */
function samplePulseWave(u: number): number {
  const systolicPeak = 0.85 * Math.exp(-Math.pow((u - 0.40) / 0.075, 2));
  const dicroticNotch = 0.35 * Math.exp(-Math.pow((u - 0.58) / 0.09, 2));
  return systolicPeak + dicroticNotch - 0.2;
}

export const VitalDrilldownModal: React.FC<VitalDrilldownModalProps> = ({
  metric,
  astronaut,
  latest,
  history,
  theme,
  onSelectMetric,
  onClose,
}) => {
  const [paused, setPaused] = useState(false);
  const [sweepSpeed, setSweepSpeed] = useState<25 | 50>(25);
  const [gain, setGain] = useState<1 | 2>(1);

  const ecgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const latestRef = useRef<TelemetrySample | undefined>(latest);
  latestRef.current = latest;

  const meta = METRIC_META[metric];

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Compute live stream statistics
  const stats = useMemo(() => {
    const vals = history.map(meta.extract);
    if (vals.length === 0) {
      return { min: '--', mean: '--', max: '--', current: '--' };
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const decimals = metric === 'heartRate' || metric === 'systolicBp' ? 0 : 2;
    return {
      min: min.toFixed(decimals),
      mean: mean.toFixed(decimals),
      max: max.toFixed(decimals),
      current: latest ? meta.extract(latest).toFixed(decimals) : '--',
    };
  }, [history, latest, meta, metric]);

  // 60fps Live QRS ECG & Secondary Waveform Canvas Sweep
  useEffect(() => {
    const canvas = ecgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let lastTs = performance.now();
    const bufferLen = 420;
    const primarySamples = new Array<number>(bufferLen).fill(0);
    const secondarySamples = new Array<number>(bufferLen).fill(0);
    let writeIdx = 0;

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      ctx.clearRect(0, 0, w, h);

      // Calibration medical grid
      const gridStep = (sweepSpeed === 50 ? 28 : 20) * dpr;
      ctx.strokeStyle = theme === 'dark' ? 'rgba(6, 182, 212, 0.09)' : 'rgba(15, 23, 42, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += gridStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += gridStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      if (!paused) {
        const cur = latestRef.current;
        const hr = cur?.heartRate ?? 72;
        const stress =
          cur?.mode === 'CRITICAL'
            ? 1.0
            : cur?.mode === 'WARNING' || cur?.mode === 'EVA_STRAIN'
              ? 0.55
              : 0.05;

        const beatsPerSec = hr / 60;
        const steps = sweepSpeed === 50 ? 3 : 2;
        for (let s = 0; s < steps; s++) {
          phase = (phase + (dt / steps) * beatsPerSec) % 1;
          primarySamples[writeIdx] = samplePqrst(phase, stress);
          secondarySamples[writeIdx] = samplePulseWave(phase);
          writeIdx = (writeIdx + 1) % bufferLen;
        }
      }

      const baselineY = h * 0.58;
      const ampScale = h * 0.32 * gain;

      // Draw secondary PPG/arterial overlay when viewing non-HR metric
      if (metric !== 'heartRate') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        for (let i = 0; i < bufferLen; i++) {
          const x = (i / (bufferLen - 1)) * w;
          const distFromHead = (writeIdx - i + bufferLen) % bufferLen;
          if (distFromHead < 10) continue;
          const y = baselineY - secondarySamples[i] * ampScale * 0.85;
          if (i === 0 || distFromHead === 10) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Draw Lead-II QRS ECG Waveform
      ctx.strokeStyle = metric === 'heartRate' ? '#06B6D4' : theme === 'dark' ? 'rgba(248, 250, 252, 0.55)' : 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = (metric === 'heartRate' ? 2.4 : 1.4) * dpr;
      ctx.beginPath();
      for (let i = 0; i < bufferLen; i++) {
        const x = (i / (bufferLen - 1)) * w;
        const distFromHead = (writeIdx - i + bufferLen) % bufferLen;
        if (distFromHead < 10) continue;
        const y = baselineY - primarySamples[i] * ampScale;
        if (i === 0 || distFromHead === 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Sweep cursor dot
      const headX = (writeIdx / (bufferLen - 1)) * w;
      const headVal = metric === 'heartRate' ? primarySamples[(writeIdx - 1 + bufferLen) % bufferLen] : secondarySamples[(writeIdx - 1 + bufferLen) % bufferLen];
      const headY = baselineY - headVal * ampScale;
      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.arc(headX, headY, 3.8 * dpr, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [gain, meta.color, metric, paused, sweepSpeed, theme]);

  // Elevated Historical Trend Chart.js instance
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const isDark = theme === 'dark';
    const textColor = isDark ? '#CBD5E1' : '#334155';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';

    chartInstanceRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: `${meta.label} (${meta.unit})`,
            data: [],
            borderColor: meta.color,
            backgroundColor: `${meta.color}22`,
            fill: true,
            tension: 0.28,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
          },
          {
            label: `Warning Threshold (${meta.warnThreshold})`,
            data: [],
            borderColor: '#F59E0B',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
          {
            label: `Critical Threshold (${meta.critThreshold})`,
            data: [],
            borderColor: '#F43F5E',
            borderDash: [3, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 11 },
            },
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(7, 9, 14, 0.92)' : 'rgba(255, 255, 255, 0.96)',
            titleColor: isDark ? '#F8FAFC' : '#0F172A',
            bodyColor: isDark ? '#CBD5E1' : '#334155',
            borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.16)',
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            ticks: { color: textColor, maxTicksLimit: 8, font: { family: "'JetBrains Mono', monospace", size: 10 } },
            grid: { color: gridColor },
          },
          y: {
            ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } },
            grid: { color: gridColor },
          },
        },
      },
    });

    return () => {
      chartInstanceRef.current?.destroy();
      chartInstanceRef.current = null;
    };
  }, [meta.color, meta.critThreshold, meta.label, meta.unit, meta.warnThreshold, metric, theme]);

  // Feed live history into Chart.js
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const sliced = history.slice(-60);
    chart.data.labels = sliced.map((s) => new Date(s.timestamp).toLocaleTimeString([], { hour12: false }));
    chart.data.datasets[0].data = sliced.map(meta.extract);
    chart.data.datasets[1].data = sliced.map(() => meta.warnThreshold);
    chart.data.datasets[2].data = sliced.map(() => meta.critThreshold);
    chart.update('none');
  }, [history, meta]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${meta.label} Elevated Trend and QRS Waveform`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="astro-glass-elevated w-full max-w-5xl rounded-2xl p-6 sm:p-8 space-y-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 dark:border-white/15 pb-4">
          <div>
            <div className="text-xs font-mono-tabular text-cyan-600 dark:text-cyan-400">
              {astronaut.callsign} · {astronaut.name}
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {meta.label} — Elevated Trend & QRS Waveform
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Drill-Down Modal"
            className="rounded-lg border border-slate-300 dark:border-white/22 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Metric Quick-Switcher */}
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(METRIC_META) as TelemetryMetricKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectMetric(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                key === metric
                  ? 'bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 font-semibold'
                  : 'border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {METRIC_META[key].label}
            </button>
          ))}
        </div>

        {/* Stream Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200/80 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.03] p-3.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Live Reading</div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {stats.current} <span className="text-xs font-normal text-slate-500">{meta.unit}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.03] p-3.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Window Minimum</div>
            <div className="font-mono-tabular text-2xl font-semibold text-slate-900 dark:text-white mt-1">
              {stats.min} <span className="text-xs font-normal text-slate-500">{meta.unit}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.03] p-3.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Rolling Mean</div>
            <div className="font-mono-tabular text-2xl font-semibold text-slate-900 dark:text-white mt-1">
              {stats.mean} <span className="text-xs font-normal text-slate-500">{meta.unit}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.03] p-3.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Window Peak</div>
            <div className="font-mono-tabular text-2xl font-semibold text-slate-900 dark:text-white mt-1">
              {stats.max} <span className="text-xs font-normal text-slate-500">{meta.unit}</span>
            </div>
          </div>
        </div>

        {/* High-Resolution QRS ECG Oscilloscope */}
        <div className="rounded-xl border border-slate-200 dark:border-white/20 bg-slate-50/90 dark:bg-[#05070B] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                {meta.waveformTitle}
              </h3>
              <p className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                HR {latest?.heartRate ?? '--'} BPM · HRV {latest?.hrvMs ?? '--'} ms · Mode {latest?.mode ?? 'NORMAL'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSweepSpeed((s) => (s === 25 ? 50 : 25))}
                className="rounded-lg border border-slate-300 dark:border-white/20 px-2.5 py-1 text-xs font-mono-tabular text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
              >
                {sweepSpeed} mm/s
              </button>
              <button
                type="button"
                onClick={() => setGain((g) => (g === 1 ? 2 : 1))}
                className="rounded-lg border border-slate-300 dark:border-white/20 px-2.5 py-1 text-xs font-mono-tabular text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
              >
                Gain {gain}x
              </button>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-1 text-xs font-semibold text-white dark:text-slate-950 cursor-pointer"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                <span>{paused ? 'Resume' : 'Freeze'}</span>
              </button>
            </div>
          </div>

          <canvas ref={ecgCanvasRef} className="w-full h-44 rounded-lg block" />
        </div>

        {/* Elevated Historical Trend (Chart.js) */}
        <div className="rounded-xl border border-slate-200 dark:border-white/20 bg-white/70 dark:bg-white/[0.02] p-4 space-y-2">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Elevated Telemetry Trend (Last 60 Samples)
          </h3>
          <div className="h-56 w-full">
            <canvas ref={chartCanvasRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
