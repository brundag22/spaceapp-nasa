import { useState } from 'react';
import { Activity, ArrowRight, CircleHelp, LockKeyhole, Orbit, Shield, UserRound } from 'lucide-react';
import type { RoleName } from './api';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error?: string;
  busy?: boolean;
}

const accounts: Record<RoleName, { email: string; password: string; title: string; detail: string }> = {
  ROLE_FLIGHT_SURGEON: {
    email: 'surgeon@astrocare.demo', password: 'FlightDoc!26', title: 'Flight Surgeon',
    detail: 'Multi-crew oversight · simulator controls · clinical markers',
  },
  ROLE_ASTRONAUT: {
    email: 'astronaut@astrocare.demo', password: 'OrbitCrew!26', title: 'Astronaut',
    detail: 'Personal telemetry · medical record · emergency SOS',
  },
};

export function LoginView({ onLogin, error, busy = false }: LoginViewProps) {
  const [role, setRole] = useState<RoleName>('ROLE_FLIGHT_SURGEON');
  const [email, setEmail] = useState(accounts.ROLE_FLIGHT_SURGEON.email);
  const [password, setPassword] = useState(accounts.ROLE_FLIGHT_SURGEON.password);
  const account = accounts[role];

  function selectRole(next: RoleName) {
    setRole(next);
    setEmail(accounts[next].email);
    setPassword(accounts[next].password);
  }

  return (
    <main className="login-screen">
      <div className="login-ambient ambient-a" />
      <div className="login-ambient ambient-b" />
      <header className="login-brand">
        <span className="brand-mark"><Orbit size={18} /><Activity size={16} className="brand-pulse" /></span>
        <span className="brand-name">ASTRO<span>CARE</span></span>
        <span className="brand-divider" />
        <span className="brand-subtitle">MISSION HEALTH CONSOLE</span>
      </header>
      <div className="login-grid">
        <section className="login-story">
          <div className="eyebrow"><span className="eyebrow-line" /> CREW HEALTH · ORBITAL OPERATIONS</div>
          <h1>Care that keeps<br /><span>pace with orbit.</span></h1>
          <p className="login-lede">A unified flight-medicine console for crew telemetry, clinical context, and countermeasure response.</p>
          <div className="login-visual" aria-label="Illustration of orbital telemetry and crew health">
            <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
            <div className="orbit-node node-one" /><div className="orbit-node node-two" /><div className="orbit-node node-three" />
            <div className="orbit-core"><Activity size={32} strokeWidth={1.4} /></div>
            <div className="visual-signal"><span>LIVE TELEMETRY</span><strong>4 SIGNAL GROUPS</strong><small>VITALS · EVA · RADIATION · ECG</small></div>
            <svg className="signal-wave" viewBox="0 0 520 92" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 49 H78 L92 44 L102 49 H157 L172 47 L181 49 H228 L238 48 L249 49 H283 L298 45 L309 49 H348 L360 48 L369 49 H382 L393 14 L402 80 L411 37 L418 50 H453 L466 47 L477 49 H520" />
              <path className="signal-wave-shadow" d="M0 49 H78 L92 44 L102 49 H157 L172 47 L181 49 H228 L238 48 L249 49 H283 L298 45 L309 49 H348 L360 48 L369 49 H382 L393 14 L402 80 L411 37 L418 50 H453 L466 47 L477 49 H520" />
            </svg>
            <div className="visual-caption"><span>MISSION ASSURANCE</span><span>29° 33′ N / ORBITAL REFERENCE</span></div>
          </div>
          <div className="login-footnote"><Shield size={15} /> ROLE-BASED ACCESS · FLIGHT SURGEON + ASTRONAUT</div>
        </section>
        <section className="login-panel-wrap">
          <div className="login-panel glass-panel">
            <div className="login-panel-head">
              <div className="login-panel-icon"><LockKeyhole size={20} /></div>
              <div><span className="micro-label">IDENTITY GATEWAY</span><h2>Enter the console</h2></div>
              <div className="secure-chip"><span /> DEMO ACCESS</div>
            </div>
            <p className="login-panel-copy">Choose your mission role. Demo accounts are pre-seeded for presentation.</p>
            <div className="role-tabs" role="tablist" aria-label="Choose demo role">
              <button className={role === 'ROLE_FLIGHT_SURGEON' ? 'role-tab active' : 'role-tab'} onClick={() => selectRole('ROLE_FLIGHT_SURGEON')} role="tab" aria-selected={role === 'ROLE_FLIGHT_SURGEON'}>
                <Shield size={15} /><span>Flight Surgeon</span>
              </button>
              <button className={role === 'ROLE_ASTRONAUT' ? 'role-tab active' : 'role-tab'} onClick={() => selectRole('ROLE_ASTRONAUT')} role="tab" aria-selected={role === 'ROLE_ASTRONAUT'}>
                <UserRound size={15} /><span>Astronaut</span>
              </button>
            </div>
            <div className="role-summary"><span className="role-summary-dot" /><div><strong>{account.title} view</strong><small>{account.detail}</small></div></div>
            <form className="login-form" onSubmit={(event) => { event.preventDefault(); void onLogin(email, password); }}>
              <label htmlFor="login-email">DEMO ACCOUNT</label>
              <div className="input-wrap"><UserRound size={16} /><input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></div>
              <label htmlFor="login-password">ACCESS PHRASE</label>
              <div className="input-wrap"><LockKeyhole size={16} /><input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
              {error && <div className="login-error" role="alert"><CircleHelp size={15} />{error}</div>}
              <button className="button-primary login-submit" type="submit" disabled={busy}>
                {busy ? <span className="button-spinner" /> : <>{`Authenticate as ${account.title}`}<ArrowRight size={16} /></>}
              </button>
            </form>
            <div className="login-boundary"><Shield size={13} /><span>Secure demo session · synthetic crew records · no live flight-control link</span></div>
          </div>
          <div className="login-panel-meta"><span>ASTROCARE SYSTEMS</span><span>BUILD 01.26 <i /> CONNECTION ENCRYPTED</span></div>
        </section>
      </div>
      <footer className="login-footer"><span>© ASTROCARE · MISSION HEALTH SYSTEMS</span><span>DEMO ENVIRONMENT · NOT FOR CLINICAL USE</span></footer>
    </main>
  );
}
