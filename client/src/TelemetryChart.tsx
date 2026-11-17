import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { VitalReading } from './api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface TelemetryChartProps { readings: VitalReading[]; metric?: 'all' | 'bloodPressure' | keyof Pick<VitalReading, 'heartRate' | 'spo2' | 'coreTemperatureC' | 'respiratoryRate' | 'evaSuitPressurePsi' | 'radiationMsvH'>; compact?: boolean; theme?: 'dark' | 'light' }

const getValue = (reading: VitalReading, metric: string) => Number(reading[metric as keyof VitalReading]);

export function TelemetryChart({ readings, metric = 'all', compact = false, theme = 'dark' }: TelemetryChartProps) {
  const rows = readings.slice(-36);
  const labels = rows.map((reading) => new Date(reading.recordedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const palette = theme === 'light'
    ? { brand: '#087f75', muted: '#587066', faint: '#879c93', grid: 'rgba(24,65,55,.075)' }
    : { brand: '#25e0cf', muted: '#9aaea5', faint: '#667b72', grid: 'rgba(219,245,237,.075)' };
  const textMuted = palette.muted;
  const textFaint = palette.faint;
  const gridLine = palette.grid;
  const colors = { heartRate: palette.brand, spo2: '#7da7ff', systolicBp: palette.brand, diastolicBp: '#d29aff', coreTemperatureC: '#ffb365', respiratoryRate: '#d88cff', evaSuitPressurePsi: '#49d3ff', radiationMsvH: '#ff7d6e' };
  const metricLabels: Record<string, string> = { heartRate: 'HEART RATE · BPM', spo2: 'SpO₂ · %', systolicBp: 'SYSTOLIC · mmHg', diastolicBp: 'DIASTOLIC · mmHg', coreTemperatureC: 'CORE TEMP · °C', respiratoryRate: 'RESPIRATION · /MIN', evaSuitPressurePsi: 'EVA PRESSURE · PSI', radiationMsvH: 'RADIATION · mSv/h' };
  const selected = metric === 'all' ? ['heartRate', 'spo2'] : metric === 'bloodPressure' ? ['systolicBp', 'diastolicBp'] : [metric];
  const datasets = selected.map((key) => ({
    label: metricLabels[key] ?? key,
    data: rows.map((reading) => getValue(reading, key)),
    borderColor: colors[key as keyof typeof colors],
    backgroundColor: `${colors[key as keyof typeof colors]}18`,
    yAxisID: metric === 'all' && key === 'spo2' ? 'y1' : 'y',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.36,
    fill: key === 'heartRate' && metric !== 'all',
  }));
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: !compact, position: 'top' as const, align: 'end' as const, labels: { color: textMuted, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 20, font: { family: 'JetBrains Mono', size: 9 } } },
      tooltip: { backgroundColor: 'rgba(7,20,19,.96)', borderColor: 'rgba(37,224,207,.28)', borderWidth: 1, titleFont: { family: 'JetBrains Mono', size: 10 }, bodyFont: { family: 'JetBrains Mono', size: 11 }, padding: 10, displayColors: true },
    },
    scales: {
      x: { grid: { color: gridLine, drawTicks: false }, border: { display: false }, ticks: { color: textFaint, maxTicksLimit: compact ? 4 : 7, maxRotation: 0, font: { family: 'JetBrains Mono', size: 9 } } },
      y: { position: 'left' as const, grid: { color: gridLine, drawTicks: false }, border: { display: false }, ticks: { color: textFaint, maxTicksLimit: 5, padding: 8, font: { family: 'JetBrains Mono', size: 9 } } },
      ...(metric === 'all' ? { y1: { position: 'right' as const, min: 80, max: 100, grid: { drawOnChartArea: false }, border: { display: false }, ticks: { color: textFaint, maxTicksLimit: 4, padding: 8, font: { family: 'JetBrains Mono', size: 9 } } } } : {}),
    },
  };
  return <div className={`chart-canvas ${compact ? 'chart-compact' : ''}`}><Line data={{ labels, datasets }} options={options} /></div>;
}
