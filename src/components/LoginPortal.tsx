import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, ShieldCheck, Stethoscope, UserCheck, WifiOff } from 'lucide-react';
import type { AuthUser, CrewTelemetryState, UserRole } from '../types/astrocare';

interface LoginPortalProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
  loginSectionRef: React.RefObject<HTMLDivElement | null>;
}

const PRESET_ACCOUNTS: Array<{
  role: UserRole;
  label: string;
  sublabel: string;
  email: string;
  passcode: string;
  callsign: string;
}> = [
  {
    role: 'FLIGHT_SURGEON',
    label: 'Dr. Elena Vance',
    sublabel: 'Lead Flight Surgeon · Mission Control',
    email: 'elena.vance@astrocare.space',
    passcode: 'ASTRO-MED-01',
    callsign: 'FLIGHT-SURGEON-01',
  },
  {
    role: 'ASTRONAUT',
    label: 'CDR. Marcus Chen',
    sublabel: 'Mission Commander · EVA-1 Lead',
    email: 'marcus.chen@astrocare.space',
    passcode: 'EVA-CDR-01',
    callsign: 'ISS-CDR-01',
  },
  {
    role: 'ASTRONAUT',
    label: 'PLT. Aria Patel',
    sublabel: 'Orbital Pilot · Biomed Officer',
    email: 'aria.patel@astrocare.space',
    passcode: 'EVA-PLT-02',
    callsign: 'ISS-PLT-02',
  },
];

export const LoginPortal: React.FC<LoginPortalProps> = ({ onLoginSuccess, loginSectionRef }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('FLIGHT_SURGEON');
  const [email, setEmail] = useState('elena.vance@astrocare.space');
  const [passcode, setPasscode] = useState('ASTRO-MED-01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crewPreview, setCrewPreview] = useState<CrewTelemetryState[]>([]);

  useEffect(() => {
    let active = true;
    const fetchCrew = async () => {
      try {
        const res = await fetch('/api/crew');
        if (!res.ok) return;
        const data = (await res.json()) as { crew: CrewTelemetryState[] };
        if (active && Array.isArray(data.crew)) {
          setCrewPreview(data.crew);
        }
      } catch {
        // Offline or server starting
      }
    };
    fetchCrew();
    const timer = window.setInterval(fetchCrew, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleRoleSwitch = (role: UserRole) => {
    setSelectedRole(role);
    setError(null);
    const preset = PRESET_ACCOUNTS.find((p) => p.role === role);
    if (preset) {
      setEmail(preset.email);
      setPasscode(preset.passcode);
    }
  };

  const handlePresetClick = (preset: (typeof PRESET_ACCOUNTS)[number]) => {
    setSelectedRole(preset.role);
    setEmail(preset.email);
    setPasscode(preset.passcode);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, email, passcode }),
      });
      const data = (await res.json()) as { user?: AuthUser; token?: string; error?: string };
      if (!res.ok || !data.user || !data.token) {
        setError(data.error || 'Authentication failed. Verify callsign and passcode.');
        return;
      }
      onLoginSuccess(data.user, data.token);
    } catch {
      setError('Unable to reach AstroCare authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
        {/* Left Column: Mission Overview & Live Crew Telemetry Feed */}
        <section id="capabilities" className="lg:col-span-7 flex flex-col justify-between gap-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular text-slate-600 dark:text-slate-400">
              <span>Orbital Biomedical Ops</span>
              <span aria-hidden="true">·</span>
              <span>STOMP / SockJS Live Telemetry</span>
              <span aria-hidden="true">·</span>
              <span>IndexedDB Resilient Cache</span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.1] max-w-2xl [text-wrap:balance]">
              Precision biomedical telemetry for orbital flight crews.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              AstroCare unifies live suit and physiological sensor streams, high-resolution QRS ECG waveform diagnostics, automated anatomical breach mapping, and offline-resilient clinical reporting inside a single mission workspace.
            </p>
          </div>

          {/* Live Crew Stream Snapshot from /api/crew (zero hardcoded placeholders) */}
          <div id="architecture" className="astro-glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/15 pb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Active Orbital Crew Link
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Live 1 Hz telemetry sampled directly from mission server
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-medium text-emerald-700 dark:text-emerald-400">
                ● Stream Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {crewPreview.length === 0 ? (
                <div className="sm:col-span-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400 font-mono-tabular">
                  Acquiring orbital telemetry stream...
                </div>
              ) : (
                crewPreview.map(({ profile, latest }) => {
                  const statusTone = profile.sosActive || profile.mode === 'CRITICAL'
                    ? 'text-rose-600 dark:text-rose-400'
                    : profile.mode === 'WARNING' || profile.mode === 'EVA_STRAIN'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';
                  const statusSymbol = profile.sosActive || profile.mode === 'CRITICAL'
                    ? '✖'
                    : profile.mode === 'WARNING' || profile.mode === 'EVA_STRAIN'
                      ? '▲'
                      : '●';
                  return (
                    <div
                      key={profile.id}
                      className="rounded-xl border border-slate-200/90 dark:border-white/15 bg-slate-50/70 dark:bg-white/[0.03] p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-xs font-semibold text-slate-900 dark:text-white">
                          {profile.callsign}
                        </span>
                        <span className={`font-mono-tabular text-xs font-semibold ${statusTone}`}>
                          {statusSymbol} {profile.sosActive ? 'SOS' : profile.mode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        {profile.name}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70 dark:border-white/10">
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Heart Rate</div>
                          <div className="font-mono-tabular text-base font-semibold text-slate-900 dark:text-white">
                            {latest?.heartRate ?? '--'} <span className="text-[10px] text-slate-500">BPM</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">SpO2</div>
                          <div className="font-mono-tabular text-base font-semibold text-slate-900 dark:text-white">
                            {latest?.spo2?.toFixed(1) ?? '--'} <span className="text-[10px] text-slate-500">%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2.5">
                <Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <span>High-resolution QRS ECG drill-down modals on every vital card</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Stethoscope className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <span>Interactive anatomical wireframe with auto-lit breach nodes</span>
              </div>
              <div className="flex items-start gap-2.5">
                <WifiOff className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                <span>IndexedDB offline caching with automatic sync on reconnect</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Secure Role-Adaptive Login Portal */}
        <section
          id="portal"
          ref={loginSectionRef}
          className="lg:col-span-5 flex flex-col justify-center"
        >
          <div className="astro-glass-elevated rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-mono-tabular text-cyan-600 dark:text-cyan-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Authorized Mission Access</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Clinical & Crew Portal
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select your operational role to enter Flight Surgeon Mission Control or the Astronaut Biometric HUD.
              </p>
            </div>

            {/* Interactive Role Segmented Control */}
            <div
              role="tablist"
              aria-label="Operational Role"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/15"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedRole === 'FLIGHT_SURGEON'}
                onClick={() => handleRoleSwitch('FLIGHT_SURGEON')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedRole === 'FLIGHT_SURGEON'
                    ? 'bg-white dark:bg-cyan-500 text-slate-900 dark:text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                <span>Flight Surgeon</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedRole === 'ASTRONAUT'}
                onClick={() => handleRoleSwitch('ASTRONAUT')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedRole === 'ASTRONAUT'
                    ? 'bg-white dark:bg-cyan-500 text-slate-900 dark:text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Astronaut</span>
              </button>
            </div>

            {/* Credential Quick-Select Roster */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Verified Mission Credentials
              </div>
              <div className="grid grid-cols-1 gap-2">
                {PRESET_ACCOUNTS.filter((acc) => acc.role === selectedRole).map((acc) => {
                  const isSelected = email === acc.email;
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handlePresetClick(acc)}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-cyan-500/70 bg-cyan-500/10 dark:bg-cyan-500/15'
                          : 'border-slate-200 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {acc.label}
                        </span>
                        <span className="font-mono-tabular text-xs text-cyan-700 dark:text-cyan-400">
                          {acc.callsign}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {acc.sublabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="astro-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Mission Email / Callsign
                </label>
                <input
                  id="astro-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-white/22 bg-white/80 dark:bg-white/[0.04] px-3.5 py-2.5 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="astro-passcode"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Authorization Passcode
                </label>
                <input
                  id="astro-passcode"
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-white/22 bg-white/80 dark:bg-white/[0.04] px-3.5 py-2.5 text-sm font-mono-tabular text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 dark:bg-cyan-500 px-4 py-3 text-sm font-semibold text-white dark:text-slate-950 hover:bg-cyan-500 dark:hover:bg-cyan-400 disabled:opacity-60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                <span>
                  {loading
                    ? 'Authenticating Telemetry Link...'
                    : selectedRole === 'FLIGHT_SURGEON'
                      ? 'Enter Flight Surgeon Console'
                      : 'Enter Astronaut Biometric HUD'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
};
