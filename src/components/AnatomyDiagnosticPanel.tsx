import React, { useMemo, useRef, useState } from 'react';
import { Crosshair, MapPin, Trash2 } from 'lucide-react';
import type {
  AnatomyMarker,
  AnatomyZone,
  MarkerSeverity,
  TelemetrySample,
  UserRole,
} from '../types/astrocare';

interface AnatomyDiagnosticPanelProps {
  astronautId: string;
  userRole: UserRole;
  userName: string;
  latest: TelemetrySample | undefined;
  markers: AnatomyMarker[];
  onPinMarker: (marker: Omit<AnatomyMarker, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteMarker: (markerId: string) => Promise<void>;
}

const ZONE_CONFIG: Record<
  AnatomyZone,
  {
    label: string;
    short: string;
    anchorX: number;
    anchorY: number;
    description: string;
  }
> = {
  CRANIAL_OCULAR: {
    label: 'Cranial / Ocular',
    short: 'Cranial/Ocular',
    anchorX: 50,
    anchorY: 13.5,
    description: 'SANS neuro-ocular pressure, radiation flux, core thermal load',
  },
  THORACIC_CARDIAC: {
    label: 'Thoracic / Cardiac',
    short: 'Thoracic/Cardiac',
    anchorX: 53.5,
    anchorY: 32.5,
    description: 'Myocardial rhythm, QRS morphology, arterial pressure surge',
  },
  PULMONARY: {
    label: 'Pulmonary',
    short: 'Pulmonary',
    anchorX: 43,
    anchorY: 30,
    description: 'Alveolar SpO2 exchange, CO2 partial pressure, respiratory load',
  },
  PERIPHERAL_SUIT_SEAL: {
    label: 'Peripheral / Suit Seal',
    short: 'Peripheral/Suit Seal',
    anchorX: 74,
    anchorY: 53,
    description: 'xEMU wrist/glove bearing seals, peripheral perfusion, suit kPa',
  },
};

export const AnatomyDiagnosticPanel: React.FC<AnatomyDiagnosticPanelProps> = ({
  astronautId,
  userRole,
  userName,
  latest,
  markers,
  onPinMarker,
  onDeleteMarker,
}) => {
  const [viewMode, setViewMode] = useState<'anterior' | 'posterior'>('anterior');
  const [is3dTilt, setIs3dTilt] = useState(true);
  const [selectedZone, setSelectedZone] = useState<AnatomyZone>('THORACIC_CARDIAC');
  const [selectedSeverity, setSelectedSeverity] = useState<MarkerSeverity>('amber');
  const [noteInput, setNoteInput] = useState('');
  const [filterZone, setFilterZone] = useState<AnatomyZone | 'ALL'>('ALL');
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const canPin = userRole === 'FLIGHT_SURGEON';

  const breachedByZone = useMemo(() => {
    const map = new Map<AnatomyZone, { severity: MarkerSeverity; reason: string; value: string }>();
    for (const b of latest?.breachedZones ?? []) {
      map.set(b.zone, { severity: b.severity, reason: b.reason, value: b.value });
    }
    return map;
  }, [latest]);

  const filteredMarkers = useMemo(() => {
    return markers.filter((m) => filterZone === 'ALL' || m.zone === filterZone);
  }, [markers, filterZone]);

  const handleSchematicClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canPin || !svgContainerRef.current || submitting) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));

    setSubmitting(true);
    try {
      await onPinMarker({
        astronautId,
        zone: selectedZone,
        severity: selectedSeverity,
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        view: viewMode,
        note:
          noteInput.trim() ||
          `${ZONE_CONFIG[selectedZone].label} clinical observation pinned at (${x.toFixed(1)}%, ${y.toFixed(1)}%).`,
        createdBy: userName,
      });
      setNoteInput('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setHoverCoords({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
  };

  return (
    <section id="anatomy" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Anatomical Diagnostic & Body Anomaly Schematic
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Auto-illuminating breach nodes synced with live telemetry ·{' '}
            {canPin
              ? 'Select a zone and click exact body coordinates to pin anomaly markers'
              : 'Read-only astronaut physiological node inspection'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-100/80 dark:bg-white/[0.04] p-1">
            {(['anterior', 'posterior'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
                  viewMode === v
                    ? 'bg-white dark:bg-cyan-500 text-slate-900 dark:text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIs3dTilt((t) => !t)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              is3dTilt
                ? 'border-cyan-500/70 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'
            }`}
          >
            3D Isometric: {is3dTilt ? 'On' : 'Flat'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Interactive 3D/SVG Human Wireframe Schematic */}
        <div className="lg:col-span-6 astro-glass rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500 dark:text-slate-400 pb-3 border-b border-slate-200/70 dark:border-white/10">
            <span>View: {viewMode.toUpperCase()} · {is3dTilt ? '3D PROJECTION' : '2D ORTHO'}</span>
            <span>
              {hoverCoords ? `X: ${hoverCoords.x.toFixed(1)}% · Y: ${hoverCoords.y.toFixed(1)}%` : 'Hover schematic for coords'}
            </span>
          </div>

          <div className="relative flex-1 flex items-center justify-center py-4" style={{ perspective: '900px' }}>
            <div
              ref={svgContainerRef}
              onClick={handleSchematicClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverCoords(null)}
              role={canPin ? 'button' : 'img'}
              tabIndex={canPin ? 0 : -1}
              aria-label="Interactive Human Anatomical Wireframe Schematic"
              className={`relative w-full max-w-[360px] aspect-[3/4] select-none transition-transform duration-300 ${
                canPin ? 'cursor-crosshair' : 'cursor-default'
              }`}
              style={{
                transform: is3dTilt
                  ? `rotateY(${viewMode === 'anterior' ? '-10deg' : '10deg'}) rotateX(4deg)`
                  : 'none',
              }}
            >
              {/* Wireframe Human Body SVG */}
              <svg
                viewBox="0 0 300 400"
                className="w-full h-full overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  <radialGradient id="breachGlowRed" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="breachGlowAmber" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Calibration Backdrop Rings */}
                <ellipse
                  cx="150"
                  cy="365"
                  rx="82"
                  ry="14"
                  fill="none"
                  className="stroke-cyan-500/25"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <line x1="150" y1="12" x2="150" y2="375" className="stroke-slate-400/20 dark:stroke-white/10" strokeDasharray="3 5" />

                {/* Outer Human Silhouette Wireframe */}
                <path
                  d="M150 22 C168 22 176 35 176 52 C176 66 167 76 159 80 L162 90 L198 102 C210 106 218 118 221 136 L234 214 C236 225 227 232 220 228 L207 152 L201 142 L195 204 L198 232 L188 302 L182 362 C181 368 168 368 167 361 L167 296 L154 236 L146 236 L133 296 L133 361 C132 368 119 368 118 362 L112 302 L102 232 L105 204 L99 142 L93 152 L80 228 C73 232 64 225 66 214 L79 136 C82 118 90 106 102 102 L138 90 L141 80 C133 76 124 66 124 52 C124 35 132 22 150 22 Z"
                  fill="rgba(6, 182, 212, 0.04)"
                  className="stroke-cyan-600/70 dark:stroke-cyan-400/70"
                  strokeWidth="1.4"
                />

                {/* Skeletal / Thoracic Wireframe Ribs & Spine */}
                <g className="stroke-cyan-600/35 dark:stroke-cyan-300/30" fill="none" strokeWidth="1">
                  {/* Cranial mesh */}
                  <ellipse cx="150" cy="50" rx="18" ry="22" strokeDasharray="2 2" />
                  {/* Clavicle & Spine */}
                  <path d="M112 104 Q150 96 188 104" />
                  <line x1="150" y1="88" x2="150" y2="215" />
                  {/* Ribcage */}
                  <path d="M120 116 Q150 110 180 116" />
                  <path d="M116 128 Q150 122 184 128" />
                  <path d="M118 140 Q150 134 182 140" />
                  <path d="M123 152 Q150 146 177 152" />
                  {/* Pelvis */}
                  <path d="M112 204 Q150 222 188 204" />
                  {/* Suit wrist & ankle seal rings */}
                  <ellipse cx="75" cy="212" rx="10" ry="4" />
                  <ellipse cx="225" cy="212" rx="10" ry="4" />
                  <ellipse cx="126" cy="346" rx="10" ry="4" />
                  <ellipse cx="174" cy="346" rx="10" ry="4" />
                </g>

                {/* Bilateral Pulmonary Wireframe */}
                <g
                  className={
                    breachedByZone.has('PULMONARY')
                      ? breachedByZone.get('PULMONARY')?.severity === 'red'
                        ? 'stroke-rose-500 fill-rose-500/20'
                        : 'stroke-amber-400 fill-amber-400/20'
                      : 'stroke-cyan-500/40 fill-cyan-500/5'
                  }
                  strokeWidth="1.2"
                >
                  <path d="M144 106 C132 106 121 118 121 138 C121 150 130 156 144 152 Z" />
                  <path d="M156 106 C168 106 179 118 179 138 C179 150 170 156 156 152 Z" />
                </g>

                {/* Cardiac Wireframe Node */}
                <path
                  d="M153 122 C160 116 168 122 164 134 C161 142 154 147 148 143 C144 137 146 126 153 122 Z"
                  className={
                    breachedByZone.has('THORACIC_CARDIAC')
                      ? breachedByZone.get('THORACIC_CARDIAC')?.severity === 'red'
                        ? 'stroke-rose-500 fill-rose-500/35'
                        : 'stroke-amber-400 fill-amber-400/30'
                      : 'stroke-cyan-400/70 fill-cyan-400/15'
                  }
                  strokeWidth="1.3"
                />

                {/* Auto-Lit Telemetry Breach Nodes */}
                {(Object.keys(ZONE_CONFIG) as AnatomyZone[]).map((zoneKey) => {
                  const cfg = ZONE_CONFIG[zoneKey];
                  const breach = breachedByZone.get(zoneKey);
                  const isSelectedZone = selectedZone === zoneKey;
                  const cx = (cfg.anchorX / 100) * 300;
                  const cy = (cfg.anchorY / 100) * 400;

                  return (
                    <g key={zoneKey}>
                      {breach && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r="24"
                          fill={breach.severity === 'red' ? 'url(#breachGlowRed)' : 'url(#breachGlowAmber)'}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={breach ? 8 : isSelectedZone ? 7 : 5}
                        fill={
                          breach
                            ? breach.severity === 'red'
                              ? '#F43F5E'
                              : '#F59E0B'
                            : isSelectedZone
                              ? '#06B6D4'
                              : 'rgba(6, 182, 212, 0.35)'
                        }
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                      {(breach || isSelectedZone) && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r="13"
                          fill="none"
                          stroke={
                            breach
                              ? breach.severity === 'red'
                                ? '#F43F5E'
                                : '#F59E0B'
                              : '#06B6D4'
                          }
                          strokeWidth="1"
                          strokeDasharray="3 2"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Custom Pinned Anomaly Markers overlaid on exact coordinates */}
              {markers
                .filter((m) => m.view === viewMode)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={`${ZONE_CONFIG[m.zone].short}: ${m.note}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterZone(m.zone);
                    }}
                    style={{ left: `${m.x}%`, top: `${m.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-125 ${
                      m.severity === 'red' ? 'bg-rose-600' : 'bg-amber-500'
                    }`}
                  >
                    <span className="sr-only">{m.note}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </button>
                ))}
            </div>
          </div>

          {/* Live Auto-Lit Breach Telemetry Strip */}
          <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 space-y-1.5">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Active Node Threshold Status
            </div>
            {breachedByZone.size === 0 ? (
              <div className="font-mono-tabular text-xs text-emerald-600 dark:text-emerald-400">
                ● All 4 anatomical telemetry nodes nominal
              </div>
            ) : (
              <div className="space-y-1">
                {Array.from(breachedByZone.entries()).map(([zone, info]) => (
                  <div
                    key={zone}
                    className={`font-mono-tabular text-xs flex items-center justify-between gap-2 ${
                      info.severity === 'red'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    <span className="truncate">
                      {info.severity === 'red' ? '✖' : '▲'} {ZONE_CONFIG[zone].short}: {info.reason}
                    </span>
                    <span className="shrink-0 font-semibold">{info.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated Anatomical Diagnostic & Body Anomaly Marker Menu */}
        <div className="lg:col-span-6 astro-glass rounded-2xl p-5 flex flex-col justify-between gap-5">
          {/* Zone Selector & Pinning Composer */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Body Anomaly Marker Menu
              </h3>
              <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                {markers.length} Logged
              </span>
            </div>

            {/* 4 Body Zone Selection Buttons */}
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ZONE_CONFIG) as AnatomyZone[]).map((zoneKey) => {
                const cfg = ZONE_CONFIG[zoneKey];
                const breach = breachedByZone.get(zoneKey);
                const isSelected = selectedZone === zoneKey;
                return (
                  <button
                    key={zoneKey}
                    type="button"
                    onClick={() => setSelectedZone(zoneKey)}
                    className={`text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/12 dark:bg-cyan-500/15'
                        : 'border-slate-200 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {cfg.short}
                      </span>
                      {breach ? (
                        <span
                          className={`font-mono-tabular text-[11px] font-semibold ${
                            breach.severity === 'red'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {breach.severity === 'red' ? '✖' : '▲'}
                        </span>
                      ) : (
                        <span className="font-mono-tabular text-[11px] text-emerald-600 dark:text-emerald-400">
                          ●
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                      {cfg.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {canPin && (
              <div className="rounded-xl border border-slate-200/90 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.03] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <Crosshair className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Pin Marker onto {ZONE_CONFIG[selectedZone].short}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedSeverity('amber')}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                        selectedSeverity === 'amber'
                          ? 'bg-amber-500 text-slate-950'
                          : 'border border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      ▲ Amber
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSeverity('red')}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                        selectedSeverity === 'red'
                          ? 'bg-rose-600 text-white'
                          : 'border border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      ✖ Critical Red
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Enter clinical observation before clicking wireframe coordinates..."
                  className="w-full rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-[#07090E] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />

                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Click anywhere on the wireframe schematic ({viewMode}) to save coordinates via{' '}
                  <span className="font-mono-tabular">POST /api/anatomy/markers</span>.
                </div>
              </div>
            )}
          </div>

          {/* Logged Markers List */}
          <div className="space-y-3 flex-1 flex flex-col min-h-[210px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterZone('ALL')}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                    filterZone === 'ALL'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  All
                </button>
                {(Object.keys(ZONE_CONFIG) as AnatomyZone[]).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setFilterZone(z)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      filterZone === z
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {ZONE_CONFIG[z].short.split('/')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-64 space-y-2 pr-1">
              {filteredMarkers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No anomaly markers pinned in this zone.
                </div>
              ) : (
                filteredMarkers.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 dark:border-white/15 bg-white/60 dark:bg-white/[0.03] p-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-mono-tabular font-semibold ${
                            m.severity === 'red'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {m.severity === 'red' ? '✖ Critical' : '▲ Amber'}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {ZONE_CONFIG[m.zone].short}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="inline-flex items-center gap-1 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3 w-3" />
                          {m.view} ({m.x}%, {m.y}%)
                        </span>
                        {m.synced === false && (
                          <span className="font-mono-tabular text-[11px] text-amber-600 dark:text-amber-400">
                            · Queued Offline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 break-words">
                        {m.note}
                      </p>
                      <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                        {m.createdBy} · {new Date(m.createdAt).toLocaleTimeString([], { hour12: false })}
                      </div>
                    </div>

                    {canPin && (
                      <button
                        type="button"
                        onClick={() => onDeleteMarker(m.id)}
                        aria-label="Resolve and remove marker"
                        className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
