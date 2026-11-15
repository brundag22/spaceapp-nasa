import React, { useEffect, useRef, useState } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TelemetrySample } from '../types/astrocare';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
);

interface MultiAxisTelemetryChartsProps {
  history: TelemetrySample[];
  theme: 'dark' | 'light';
}

export const MultiAxisTelemetryCharts: React.FC<MultiAxisTelemetryChartsProps> = ({
  history,
  theme,
}) => {
  const [windowSize, setWindowSize] = useState<30 | 60 | 90>(60);
  const cardioCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const envCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardioChartRef = useRef<Chart | null>(null);
  const envChartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const isDark = theme === 'dark';
    const textColor = isDark ? '#CBD5E1' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
    const tooltipStyle = {
      backgroundColor: isDark ? 'rgba(7, 9, 14, 0.94)' : 'rgba(255, 255, 255, 0.96)',
      titleColor: isDark ? '#F8FAFC' : '#0F172A',
      bodyColor: isDark ? '#CBD5E1' : '#334155',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.16)',
      borderWidth: 1,
    };

    if (cardioCanvasRef.current) {
      cardioChartRef.current?.destroy();
      cardioChartRef.current = new Chart(cardioCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Heart Rate (BPM)',
              data: [],
              yAxisID: 'yLeft',
              borderColor: '#06B6D4',
              backgroundColor: '#06B6D4',
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 0,
            },
            {
              label: 'Systolic BP (mmHg)',
              data: [],
              yAxisID: 'yLeft',
              borderColor: '#3B82F6',
              backgroundColor: '#3B82F6',
              borderWidth: 2,
              borderDash: [4, 3],
              tension: 0.25,
              pointRadius: 0,
            },
            {
              label: 'SpO2 (%)',
              data: [],
              yAxisID: 'yRight',
              borderColor: '#10B981',
              backgroundColor: '#10B981',
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 0,
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
              labels: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 11 } },
            },
            tooltip: tooltipStyle,
          },
          scales: {
            x: {
              ticks: { color: textColor, maxTicksLimit: 7, font: { family: "'JetBrains Mono', monospace", size: 10 } },
              grid: { color: gridColor },
            },
            yLeft: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'BPM / mmHg', color: '#06B6D4', font: { family: "'JetBrains Mono', monospace", size: 10 } },
              ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } },
              grid: { color: gridColor },
              suggestedMin: 50,
              suggestedMax: 190,
            },
            yRight: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'SpO2 %', color: '#10B981', font: { family: "'JetBrains Mono', monospace", size: 10 } },
              ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } },
              grid: { drawOnChartArea: false },
              suggestedMin: 82,
              suggestedMax: 100,
            },
          },
        },
      });
    }

    if (envCanvasRef.current) {
      envChartRef.current?.destroy();
      envChartRef.current = new Chart(envCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Suit Pressure (kPa)',
              data: [],
              yAxisID: 'yLeft',
              borderColor: '#8B5CF6',
              backgroundColor: '#8B5CF6',
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 0,
            },
            {
              label: 'Core Temp (°C)',
              data: [],
              yAxisID: 'yRight',
              borderColor: '#F59E0B',
              backgroundColor: '#F59E0B',
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 0,
            },
            {
              label: 'CO2 Partial (mmHg)',
              data: [],
              yAxisID: 'yCo2',
              borderColor: '#EC4899',
              backgroundColor: '#EC4899',
              borderWidth: 2,
              borderDash: [4, 3],
              tension: 0.25,
              pointRadius: 0,
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
              labels: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 11 } },
            },
            tooltip: tooltipStyle,
          },
          scales: {
            x: {
              ticks: { color: textColor, maxTicksLimit: 7, font: { family: "'JetBrains Mono', monospace", size: 10 } },
              grid: { color: gridColor },
            },
            yLeft: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'Suit kPa', color: '#8B5CF6', font: { family: "'JetBrains Mono', monospace", size: 10 } },
              ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } },
              grid: { color: gridColor },
              suggestedMin: 20,
              suggestedMax: 31,
            },
            yRight: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Temp °C', color: '#F59E0B', font: { family: "'JetBrains Mono', monospace", size: 10 } },
              ticks: { color: textColor, font: { family: "'JetBrains Mono', monospace", size: 10 } },
              grid: { drawOnChartArea: false },
              suggestedMin: 36,
              suggestedMax: 40,
            },
            yCo2: {
              type: 'linear',
              position: 'right',
              display: false,
              suggestedMin: 0,
              suggestedMax: 12,
            },
          },
        },
      });
    }

    return () => {
      cardioChartRef.current?.destroy();
      envChartRef.current?.destroy();
    };
  }, [theme]);

  useEffect(() => {
    const sliced = history.slice(-windowSize);
    const labels = sliced.map((s) =>
      new Date(s.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })
    );

    if (cardioChartRef.current) {
      cardioChartRef.current.data.labels = labels;
      cardioChartRef.current.data.datasets[0].data = sliced.map((s) => s.heartRate);
      cardioChartRef.current.data.datasets[1].data = sliced.map((s) => s.systolicBp);
      cardioChartRef.current.data.datasets[2].data = sliced.map((s) => s.spo2);
      cardioChartRef.current.update('none');
    }

    if (envChartRef.current) {
      envChartRef.current.data.labels = labels;
      envChartRef.current.data.datasets[0].data = sliced.map((s) => s.suitPressure);
      envChartRef.current.data.datasets[1].data = sliced.map((s) => s.coreTemp);
      envChartRef.current.data.datasets[2].data = sliced.map((s) => s.co2Partial);
      envChartRef.current.update('none');
    }
  }, [history, windowSize]);

  return (
    <section id="telemetry" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Multi-Axis Live Telemetry Streams
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Real-time 1 Hz SockJS / STOMP physiological and xEMU suit manifold channels
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-100/80 dark:bg-white/[0.04] p-1">
          {([30, 60, 90] as const).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setWindowSize(sec)}
              className={`rounded-lg px-3 py-1 text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                windowSize === sec
                  ? 'bg-white dark:bg-cyan-500 text-slate-900 dark:text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="astro-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Cardiopulmonary Multi-Axis (HR · BP · SpO2)
            </h3>
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Dual-Y Axis
            </span>
          </div>
          <div className="h-64 w-full">
            <canvas ref={cardioCanvasRef} />
          </div>
        </div>

        <div className="astro-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Suit & Thermal Multi-Axis (kPa · °C · CO2)
            </h3>
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Tri-Channel
            </span>
          </div>
          <div className="h-64 w-full">
            <canvas ref={envCanvasRef} />
          </div>
        </div>
      </div>
    </section>
  );
};
