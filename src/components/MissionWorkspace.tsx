import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileDown,
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { stompService, type SocketConnectionStatus } from '../lib/stompClient';
import {
  cacheMarkers,
  cacheTelemetryHistory,
  getCachedMarkers,
  getCachedTelemetryHistory,
  getPendingActions,
  getPendingMarkers,
  getPendingSyncCount,
  queueOfflineAction,
  queueOfflineMarker,
  removePendingAction,
  removePendingMarker,
} from '../lib/indexedDb';
import type {
  AnatomyMarker,
  AstronautProfile,
  AuthUser,
  CrewTelemetryState,
  SimulatorMode,
  SosEvent,
  TelemetryMetricKey,
  TelemetrySample,
} from '../types/astrocare';
import { VitalCardsGrid } from './VitalCardsGrid';
import { VitalDrilldownModal } from './VitalDrilldownModal';
import { MultiAxisTelemetryCharts } from './MultiAxisTelemetryCharts';
import { AnatomyDiagnosticPanel } from './AnatomyDiagnosticPanel';

interface MissionWorkspaceProps {
  user: AuthUser;
  theme: 'dark' | 'light';
  activeSection: string;
}

const SIMULATOR_MODES: Array<{ mode: SimulatorMode; label: string; tone: string }> = [
  { mode: 'NORMAL', label: 'NORMAL', tone: 'hover:border-emerald-500/70' },
  { mode: 'WARNING', label: 'WARNING', tone: 'hover:border-amber-500/70' },
  { mode: 'CRITICAL', label: 'CRITICAL', tone: 'hover:border-rose-500/70' },
  { mode: 'EVA_STRAIN', label: 'EVA STRAIN', tone: 'hover:border-cyan-500/70' },
];

export const MissionWorkspace: React.FC<MissionWorkspaceProps> = ({
  user,
  theme,
  activeSection,
}) => {
  const isSurgeon = user.role === 'FLIGHT_SURGEON';
  const defaultAstroId = user.assignedAstronautId || 'astro-01';

  const [selectedAstroId, setSelectedAstroId] = useState<string>(defaultAstroId);
  const [crewMap, setCrewMap] = useState<Record<string, CrewTelemetryState>>({});
  const [sosEvents, setSosEvents] = useState<SosEvent[]>([]);
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>('CONNECTING');
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [drilldownMetric, setDrilldownMetric] = useState<TelemetryMetricKey | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [metSeconds, setMetSeconds] = useState(14832); // T+04:07:12 Mission Elapsed Time

  // Scroll to section when top bar navigation clicked
  useEffect(() => {
    if (!activeSection) return;
    const el = document.getElementById(activeSection);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeSection]);

  // Mission Elapsed Time clock
  useEffect(() => {
    const id = window.setInterval(() => setMetSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingSyncCount(count);
  }, []);

  // Load initial crew data from server or IndexedDB cache if offline
  const loadCrewData = useCallback(async () => {
    try {
      const res = await fetch('/api/crew');
      if (!res.ok) throw new Error('Server unavailable');
      const data = (await res.json()) as {
        crew: CrewTelemetryState[];
        sosEvents: SosEvent[];
      };

      const nextMap: Record<string, CrewTelemetryState> = {};
      for (const item of data.crew) {
        nextMap[item.profile.id] = item;
        void cacheTelemetryHistory(item.profile.id, item.history);
        void cacheMarkers(item.profile.id, item.markers);
      }
      setCrewMap(nextMap);
      setSosEvents(data.sosEvents ?? []);
    } catch {
      // Load from IndexedDB offline cache
      const fallbackIds = ['astro-01', 'astro-02', 'astro-03'];
      const cachedMap: Record<string, CrewTelemetryState> = {};
      for (const id of fallbackIds) {
        const [hist, mkrs] = await Promise.all([
          getCachedTelemetryHistory(id),
          getCachedMarkers(id),
        ]);
        if (hist.length > 0) {
          cachedMap[id] = {
            profile: {
              id,
              callsign: id === 'astro-01' ? 'ISS-CDR-01' : id === 'astro-02' ? 'ISS-PLT-02' : 'ISS-MS-03',
              name: id === 'astro-01' ? 'CDR. Marcus Chen' : id === 'astro-02' ? 'PLT. Aria Patel' : 'MS. Lukas Weber',
              missionRole: 'Cached Offline Profile',
              evaHours: 24,
              suitModel: 'xEMU-Mk IV',
              bloodType: 'O+',
              age: 36,
              mode: hist[hist.length - 1].mode,
              sosActive: false,
            },
            latest: hist[hist.length - 1],
            history: hist,
            markers: mkrs,
          };
        }
      }
      if (Object.keys(cachedMap).length > 0) {
        setCrewMap(cachedMap);
      }
    }
  }, []);

  // Automatic IndexedDB sync on reconnect
  const flushOfflineQueue = useCallback(async () => {
    if (simulatedOffline || !navigator.onLine) return;
    const [pendingMarkers, pendingActions] = await Promise.all([
      getPendingMarkers(),
      getPendingActions(),
    ]);

    if (pendingMarkers.length === 0 && pendingActions.length === 0) return;

    let syncedItems = 0;

    for (const marker of pendingMarkers) {
      try {
        const res = await fetch('/api/anatomy/markers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...marker, synced: true }),
        });
        if (res.ok) {
          await removePendingMarker(marker.id);
          syncedItems++;
        }
      } catch {
        // Keep in queue for next retry
      }
    }

    for (const act of pendingActions) {
      try {
        const endpoint = act.type === 'SOS' ? '/api/sos' : '/api/simulator/mode';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(act.payload),
        });
        if (res.ok) {
          await removePendingAction(act.id);
          syncedItems++;
        }
      } catch {
        // Keep in queue
      }
    }

    await refreshPendingCount();
    if (syncedItems > 0) {
      setSyncNotice(`Synced ${syncedItems} offline IndexedDB record${syncedItems > 1 ? 's' : ''} to Mission Control.`);
      void loadCrewData();
      window.setTimeout(() => setSyncNotice(null), 5000);
    }
  }, [loadCrewData, refreshPendingCount, simulatedOffline]);

  // Connect STOMP over SockJS and handle browser online/offline
  useEffect(() => {
    void loadCrewData();
    void refreshPendingCount();
    stompService.connect();

    const unsubStatus = stompService.onStatusChange((status) => {
      setSocketStatus(status);
      if (status === 'CONNECTED') {
        void flushOfflineQueue();
      }
    });

    const handleOnline = () => {
      if (!simulatedOffline) {
        stompService.connect();
        void flushOfflineQueue();
      }
    };
    const handleOffline = () => {
      void stompService.disconnect(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubStatus();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushOfflineQueue, loadCrewData, refreshPendingCount, simulatedOffline]);

  // Subscribe to STOMP topics for crew updates, selected astronaut telemetry, markers, and SOS alerts
  useEffect(() => {
    const unsubCrew = stompService.subscribe<{
      crew: Array<{ profile: AstronautProfile; latest: TelemetrySample; markers: AnatomyMarker[] }>;
      sosEvents: SosEvent[];
    }>('/topic/crew', (msg) => {
      setCrewMap((prev) => {
        const next = { ...prev };
        for (const item of msg.crew) {
          const existing = next[item.profile.id];
          const prevHist = existing?.history ?? [];
          const lastTs = prevHist[prevHist.length - 1]?.timestamp ?? 0;
          const updatedHist =
            item.latest && item.latest.timestamp > lastTs
              ? [...prevHist, item.latest].slice(-90)
              : prevHist;
          next[item.profile.id] = {
            profile: item.profile,
            latest: item.latest ?? existing?.latest,
            history: updatedHist,
            markers: item.markers ?? existing?.markers ?? [],
          };
          void cacheTelemetryHistory(item.profile.id, updatedHist);
          void cacheMarkers(item.profile.id, item.markers ?? []);
        }
        return next;
      });
      if (msg.sosEvents) {
        setSosEvents(msg.sosEvents);
      }
    });

    const unsubTelemetry = stompService.subscribe<TelemetrySample>(
      `/topic/telemetry/${selectedAstroId}`,
      (sample) => {
        setCrewMap((prev) => {
          const existing = prev[selectedAstroId];
          if (!existing) return prev;
          const lastTs = existing.history[existing.history.length - 1]?.timestamp ?? 0;
          const updatedHist =
            sample.timestamp > lastTs
              ? [...existing.history, sample].slice(-90)
              : existing.history;
          void cacheTelemetryHistory(selectedAstroId, updatedHist);
          return {
            ...prev,
            [selectedAstroId]: {
              ...existing,
              latest: sample,
              history: updatedHist,
            },
          };
        });
      }
    );

    const unsubMarkers = stompService.subscribe<{ markers: AnatomyMarker[] }>(
      `/topic/markers/${selectedAstroId}`,
      (msg) => {
        setCrewMap((prev) => {
          const existing = prev[selectedAstroId];
          if (!existing) return prev;
          void cacheMarkers(selectedAstroId, msg.markers);
          return {
            ...prev,
            [selectedAstroId]: {
              ...existing,
              markers: msg.markers,
            },
          };
        });
      }
    );

    const unsubAlerts = stompService.subscribe<{
      type: string;
      event: SosEvent;
      profile: AstronautProfile;
      latest: TelemetrySample;
    }>('/topic/alerts', (msg) => {
      if (msg.type === 'SOS_UPDATE') {
        void loadCrewData();
      }
    });

    return () => {
      unsubCrew();
      unsubTelemetry();
      unsubMarkers();
      unsubAlerts();
    };
  }, [loadCrewData, selectedAstroId]);

  const activeCrewState = crewMap[selectedAstroId];
  const crewList = useMemo(() => Object.values(crewMap), [crewMap]);
  const activeSosRoster = useMemo(
    () => crewList.filter((c) => c.profile.sosActive),
    [crewList]
  );

  const isOffline = simulatedOffline || socketStatus === 'OFFLINE' || !navigator.onLine;

  const handleToggleOfflineSimulation = async () => {
    const next = !simulatedOffline;
    setSimulatedOffline(next);
    await stompService.setSimulatedOffline(next);
    if (!next) {
      await flushOfflineQueue();
    }
  };

  const handleSimulatorMode = async (mode: SimulatorMode) => {
    const payload = { astronautId: selectedAstroId, mode };
    if (isOffline) {
      await queueOfflineAction({
        id: `act-${Date.now()}`,
        type: 'SIMULATOR_MODE',
        payload,
        createdAt: Date.now(),
      });
      await refreshPendingCount();
      setSyncNotice(`Offline: ${mode} mode queued in IndexedDB for sync.`);
      return;
    }

    stompService.publish('/app/simulator/mode', payload);
    await fetch('/api/simulator/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  const handleTriggerSos = async (targetId: string, active: boolean) => {
    setSosSubmitting(true);
    const payload = {
      astronautId: targetId,
      active,
      note: active
        ? `Immediate Emergency SOS triggered by ${user.name}`
        : `Cleared by ${user.name}`,
      acknowledgedBy: user.name,
    };

    try {
      if (isOffline) {
        await queueOfflineAction({
          id: `sos-act-${Date.now()}`,
          type: 'SOS',
          payload,
          createdAt: Date.now(),
        });
        await refreshPendingCount();
        setCrewMap((prev) => {
          const cur = prev[targetId];
          if (!cur) return prev;
          return {
            ...prev,
            [targetId]: {
              ...cur,
              profile: { ...cur.profile, sosActive: active, mode: active ? 'CRITICAL' : cur.profile.mode },
            },
          };
        });
        setSyncNotice('Offline: Emergency SOS queued in IndexedDB and will transmit immediately on reconnect.');
      } else {
        await fetch('/api/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
    } finally {
      setSosSubmitting(false);
    }
  };

  const handlePinMarker = async (
    markerInput: Omit<AnatomyMarker, 'id' | 'createdAt'>
  ) => {
    const newMarker: AnatomyMarker = {
      ...markerInput,
      id: `mkr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      synced: !isOffline,
    };

    // Optimistic update + IndexedDB cache
    setCrewMap((prev) => {
      const cur = prev[markerInput.astronautId];
      if (!cur) return prev;
      const nextMarkers = [newMarker, ...cur.markers];
      void cacheMarkers(markerInput.astronautId, nextMarkers);
      return {
        ...prev,
        [markerInput.astronautId]: {
          ...cur,
          markers: nextMarkers,
        },
      };
    });

    if (isOffline) {
      await queueOfflineMarker(newMarker);
      await refreshPendingCount();
      setSyncNotice('Offline: Anomaly marker cached in IndexedDB. Will auto-sync on reconnect.');
      return;
    }

    try {
      const res = await fetch('/api/anatomy/markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMarker),
      });
      if (!res.ok) throw new Error('Failed to save marker');
    } catch {
      await queueOfflineMarker(newMarker);
      await refreshPendingCount();
    }
  };

  const handleDeleteMarker = async (markerId: string) => {
    setCrewMap((prev) => {
      const cur = prev[selectedAstroId];
      if (!cur) return prev;
      const nextMarkers = cur.markers.filter((m) => m.id !== markerId);
      void cacheMarkers(selectedAstroId, nextMarkers);
      return {
        ...prev,
        [selectedAstroId]: {
          ...cur,
          markers: nextMarkers,
        },
      };
    });

    await removePendingMarker(markerId);
    await refreshPendingCount();

    if (!isOffline) {
      await fetch(`/api/anatomy/markers/${markerId}`, { method: 'DELETE' });
    }
  };

  const handleExportPdf = async () => {
    if (pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const res = await fetch(`/api/reports/pdf/${selectedAstroId}`);
      if (!res.ok) throw new Error('PDF export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const callsign = activeCrewState?.profile.callsign || selectedAstroId;
      a.download = `AstroCare_Clinical_Report_${callsign}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setSyncNotice('Unable to generate PDF while disconnected from mission server.');
      window.setTimeout(() => setSyncNotice(null), 4000);
    } finally {
      setPdfDownloading(false);
    }
  };

  const formatMet = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600)
      .toString()
      .padStart(2, '0');
    const mins = Math.floor((totalSec % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `T+${hrs}:${mins}:${secs}`;
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Workspace Telemetry Ribbon */}
      <div
        id="overview"
        className="astro-glass rounded-2xl px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono-tabular">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-white">
              {isSurgeon ? 'Flight Surgeon Mission Control' : 'Astronaut Biometric HUD'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 dark:text-slate-300">{user.name}</span>
          </div>

          <span className="text-slate-400 hidden sm:inline">·</span>
          <span className="text-slate-600 dark:text-slate-300">
            MET {formatMet(metSeconds)}
          </span>

          <span className="text-slate-400 hidden sm:inline">·</span>
          <span
            className={`font-semibold ${
              socketStatus === 'CONNECTED' && !simulatedOffline
                ? 'text-emerald-600 dark:text-emerald-400'
                : isOffline
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-cyan-600 dark:text-cyan-400'
            }`}
          >
            {socketStatus === 'CONNECTED' && !simulatedOffline
              ? '● STOMP/SockJS Live'
              : isOffline
                ? '▲ Offline — IndexedDB Cache Active'
                : '● Connecting STOMP...'}
          </span>

          {pendingSyncCount > 0 && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                {pendingSyncCount} Pending Sync
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleOfflineSimulation}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              isOffline
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
            <span>{isOffline ? 'Reconnect Link' : 'Test Offline Sync'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={pdfDownloading || isOffline}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 dark:bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-cyan-500 dark:hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{pdfDownloading ? 'Generating PDF...' : 'Export Clinical PDF'}</span>
          </button>
        </div>
      </div>

      {/* Sync / Offline Notice Banner */}
      {syncNotice && (
        <div
          role="status"
          className="astro-glass rounded-xl border-cyan-500/50 px-4 py-3 flex items-center justify-between gap-3 text-xs font-medium text-slate-800 dark:text-slate-100"
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Emergency SOS Alert Banner (Flight Surgeon & Astronaut) */}
      {activeSosRoster.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/70 bg-rose-500/12 dark:bg-rose-500/15 backdrop-blur-md p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-display text-sm font-bold text-rose-700 dark:text-rose-300">
                EMERGENCY SOS DISTRESS BEACON ACTIVE
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-200 mt-0.5">
                {activeSosRoster.map((c) => `${c.profile.name} (${c.profile.callsign})`).join(', ')} —{' '}
                {activeSosRoster[0].profile.sosNote || 'Critical physiological telemetry alert.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSurgeon && activeSosRoster[0].profile.id !== selectedAstroId && (
              <button
                type="button"
                onClick={() => setSelectedAstroId(activeSosRoster[0].profile.id)}
                className="rounded-lg border border-rose-500/50 bg-white/80 dark:bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-200 cursor-pointer"
              >
                Focus Subject
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTriggerSos(activeSosRoster[0].profile.id, false)}
              disabled={sosSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{isSurgeon ? 'Acknowledge & Clear SOS' : 'Cancel SOS Beacon'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Role-Specific Control Bar: Crew Selector + Simulator (Surgeon) OR SOS Trigger (Astronaut) */}
      {isSurgeon ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Crew Roster Selector */}
          <div className="lg:col-span-7 astro-glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Assigned Crew Telemetry Subjects
              </h2>
              <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
                {crewList.length} Active Links
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {crewList.map(({ profile, latest }) => {
                const isSelected = profile.id === selectedAstroId;
                const isCrit = profile.sosActive || profile.mode === 'CRITICAL';
                const isWarn = profile.mode === 'WARNING' || profile.mode === 'EVA_STRAIN';
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedAstroId(profile.id)}
                    className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/12 dark:bg-cyan-500/15'
                        : 'border-slate-200 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-bold text-slate-900 dark:text-white">
                        {profile.callsign}
                      </span>
                      <span
                        className={`font-mono-tabular text-[11px] font-semibold ${
                          isCrit
                            ? 'text-rose-600 dark:text-rose-400'
                            : isWarn
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isCrit ? '✖' : isWarn ? '▲' : '●'} {profile.sosActive ? 'SOS' : profile.mode}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mt-1 truncate">
                      {profile.name}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      HR {latest?.heartRate ?? '--'} · SpO2 {latest?.spo2?.toFixed(1) ?? '--'}%
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Demo Simulator Controls */}
          <div className="lg:col-span-5 astro-glass rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Physiological Telemetry Simulator
                </h2>
                <span className="font-mono-tabular text-xs text-cyan-600 dark:text-cyan-400">
                  {activeCrewState?.profile.callsign ?? selectedAstroId}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inject physiological states over live WebSocket feed to test node alerts and waveforms.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SIMULATOR_MODES.map(({ mode, label, tone }) => {
                const isActive = activeCrewState?.profile.mode === mode;
                const activeClasses =
                  mode === 'CRITICAL'
                    ? 'bg-rose-600 text-white border-rose-500'
                    : mode === 'WARNING'
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : mode === 'EVA_STRAIN'
                        ? 'bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 border-cyan-400'
                        : 'bg-emerald-600 text-white border-emerald-500';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleSimulatorMode(mode)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-mono-tabular font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? activeClasses
                        : `border-slate-200 dark:border-white/20 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 ${tone}`
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        /* Astronaut Personal Biometric Header + One-Click Emergency SOS */
        <section className="astro-glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="font-mono-tabular text-xs text-cyan-600 dark:text-cyan-400">
              {activeCrewState?.profile.callsign} · {activeCrewState?.profile.suitModel}
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {activeCrewState?.profile.name || user.name}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {activeCrewState?.profile.missionRole} · Cumulative EVA {activeCrewState?.profile.evaHours ?? '--'} hrs
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                handleTriggerSos(selectedAstroId, !activeCrewState?.profile.sosActive)
              }
              disabled={sosSubmitting}
              aria-label="Trigger Emergency SOS"
              className={`inline-flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-display font-bold tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                activeCrewState?.profile.sosActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:opacity-90'
                  : 'bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-600/25'
              }`}
            >
              <Radio className="h-4 w-4" />
              <span>
                {activeCrewState?.profile.sosActive
                  ? 'Deactivate Emergency SOS'
                  : 'One-Click Emergency SOS'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Clickable Vital Sign Cards Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Live Biometric & Suit Vitals
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Click any vital sign card to open the Elevated Trend & Lead-II QRS ECG Waveform modal
            </p>
          </div>
          {activeCrewState?.latest && (
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Last packet: {new Date(activeCrewState.latest.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
          )}
        </div>

        <VitalCardsGrid
          latest={activeCrewState?.latest}
          history={activeCrewState?.history ?? []}
          onSelectMetric={(metric) => setDrilldownMetric(metric)}
        />
      </section>

      {/* Real-Time Multi-Axis Chart.js Telemetry Graphs */}
      <MultiAxisTelemetryCharts
        history={activeCrewState?.history ?? []}
        theme={theme}
      />

      {/* Dedicated Anatomical Diagnostic & Body Anomaly Marker Menu + Wireframe Schematic */}
      <AnatomyDiagnosticPanel
        astronautId={selectedAstroId}
        userRole={user.role}
        userName={user.name}
        latest={activeCrewState?.latest}
        markers={activeCrewState?.markers ?? []}
        onPinMarker={handlePinMarker}
        onDeleteMarker={handleDeleteMarker}
      />

      {/* Clinical Report & SOS Audit Log Section */}
      <section id="reports" className="astro-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/70 dark:border-white/15 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Clinical Telemetry Audit & PDF Report Export
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Generates a signed clinical dossier from server-authoritative vitals, anomaly coordinates, and SOS events.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void flushOfflineQueue()}
              disabled={pendingSyncCount === 0 || isOffline}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-white/20 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync Offline Queue ({pendingSyncCount})</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={pdfDownloading || isOffline}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>Export Clinical PDF</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-white/15 text-slate-500 dark:text-slate-400 font-mono-tabular">
                <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                <th className="py-2.5 pr-4 font-medium">Crew Subject</th>
                <th className="py-2.5 pr-4 font-medium">Event State</th>
                <th className="py-2.5 pr-4 font-medium">Vitals Snapshot</th>
                <th className="py-2.5 font-medium">Clinical Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/10">
              {sosEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                    No SOS distress events logged during current orbital epoch.
                  </td>
                </tr>
              ) : (
                sosEvents.map((ev) => (
                  <tr key={ev.id} className="text-slate-700 dark:text-slate-200">
                    <td className="py-2.5 pr-4 font-mono-tabular whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false })}
                    </td>
                    <td className="py-2.5 pr-4 font-medium whitespace-nowrap">
                      {ev.callsign} · {ev.astronautName}
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tabular whitespace-nowrap">
                      <span
                        className={
                          ev.active
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        }
                      >
                        {ev.active ? '✖ SOS ACTIVE' : '● ACKNOWLEDGED'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tabular whitespace-nowrap">
                      HR {ev.vitalsSnapshot.heartRate} · SpO2 {ev.vitalsSnapshot.spo2}% ·{' '}
                      {ev.vitalsSnapshot.suitPressure} kPa
                    </td>
                    <td className="py-2.5">{ev.note || 'SOS Distress Beacon'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* High-Resolution QRS ECG & Elevated Trend Drill-Down Modal */}
      {drilldownMetric && activeCrewState && (
        <VitalDrilldownModal
          metric={drilldownMetric}
          astronaut={activeCrewState.profile}
          latest={activeCrewState.latest}
          history={activeCrewState.history}
          theme={theme}
          onSelectMetric={(m) => setDrilldownMetric(m)}
          onClose={() => setDrilldownMetric(null)}
        />
      )}
    </main>
  );
};
