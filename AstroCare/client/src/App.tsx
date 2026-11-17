import { useCallback, useEffect, useMemo, useState } from 'react';
import { Client } from '@stomp/stompjs';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Crosshair, Download, Droplets, ExternalLink, Eye, Gauge,
  Heart, HeartPulse, LogOut, MapPin, Menu, Moon, Plus, Radio, Search, Shield, ShieldAlert,
  Siren, Sparkles, Sun, Thermometer, UserRound, Users, Wind, X, Zap,
} from 'lucide-react';
import { api, ApiError, formatClock, formatRelative, setCsrfToken, type Alert, type Astronaut, type Marker, type Mode, type Severity, type User, type VitalReading } from './api';
import { AnatomyMap, ZONES } from './AnatomyMap';
import { LoginView } from './LoginView';
import { TelemetryChart } from './TelemetryChart';
import { MODE_COPY, MODE_LABELS } from './ui';

interface Toast { id: number; title: string; message: string; type: 'success' | 'warning' | 'error' }
interface NotificationItem { id: number; title: string; message: string; createdAt: string; readAt?: string | null; emergencyEventId?: number | null; healthAlertId?: number | null }
interface SelectedZone { id: string; label: string; short: string; x: number; y: number }
interface LatestResponse { reading: VitalReading; alerts: Alert[]; markers: Marker[] }
interface HistoryResponse { readings: VitalReading[] }
interface RosterResponse { astronauts: Astronaut[] }
interface MarkerResponse { markers: Marker[] }
interface NotificationsResponse { notifications: NotificationItem[] }
interface LoginResponse { user: User; csrfToken: string }

const MODE_ORDER: Mode[] = ['NORMAL', 'WARNING', 'CRITICAL', 'EVA_STRAIN'];
const MODE_ICONS = { NORMAL: Shield, WARNING: AlertTriangle, CRITICAL: ShieldAlert, EVA_STRAIN: Zap };
const chartMetrics = {
  heartRate: { label: 'Heart rate', unit: 'bpm', icon: HeartPulse, color: 'teal' },
  spo2: { label: 'Blood oxygen', unit: '%', icon: Droplets, color: 'blue' },
  bloodPressure: { label: 'Blood pressure', unit: 'mmHg', icon: Activity, color: 'violet' },
  coreTemperatureC: { label: 'Core temperature', unit: '°C', icon: Thermometer, color: 'orange' },
  respiratoryRate: { label: 'Respiratory rate', unit: '/min', icon: Wind, color: 'blue' },
  evaSuitPressurePsi: { label: 'EVA suit pressure', unit: 'PSI', icon: Gauge, color: 'teal' },
  radiationMsvH: { label: 'Radiation', unit: 'mSv/h', icon: Radio, color: 'orange' },
} as const;
type MetricKey = keyof typeof chartMetrics;

function initials(astronaut: Astronaut) {
  return `${astronaut.firstName[0] ?? ''}${astronaut.lastName[0] ?? ''}`;
}
function valueFor(metric: MetricKey, reading: VitalReading | null): string {
  if (!reading) return '—';
  if (metric === 'bloodPressure') return `${reading.systolicBp}/${reading.diastolicBp}`;
  const value = reading[metric];
  return typeof value === 'number' ? (metric === 'heartRate' || metric === 'respiratoryRate' ? value.toFixed(0) : value.toFixed(metric === 'spo2' ? 1 : 2)) : '—';
}
function severityFor(metric: MetricKey, reading: VitalReading | null): Severity {
  if (!reading) return 'GREEN';
  if (metric === 'heartRate') return reading.heartRate > 135 || reading.heartRate < 45 ? 'RED' : reading.heartRate > 112 || reading.heartRate < 52 ? 'YELLOW' : 'GREEN';
  if (metric === 'spo2') return reading.spo2 < 90 ? 'RED' : reading.spo2 < 94 ? 'YELLOW' : 'GREEN';
  if (metric === 'bloodPressure') return reading.systolicBp > 160 || reading.diastolicBp > 100 ? 'RED' : reading.systolicBp > 140 || reading.diastolicBp > 90 ? 'YELLOW' : 'GREEN';
  if (metric === 'coreTemperatureC') return reading.coreTemperatureC >= 38.4 ? 'RED' : reading.coreTemperatureC >= 37.8 ? 'YELLOW' : 'GREEN';
  if (metric === 'respiratoryRate') return reading.respiratoryRate > 28 ? 'RED' : reading.respiratoryRate > 22 ? 'YELLOW' : 'GREEN';
  if (metric === 'evaSuitPressurePsi') return reading.evaSuitPressurePsi < 2.4 ? 'RED' : reading.evaSuitPressurePsi < 3.3 ? 'ORANGE' : 'GREEN';
  if (metric === 'radiationMsvH') return reading.radiationMsvH > 0.9 ? 'ORANGE' : 'GREEN';
  return 'GREEN';
}
function labelSeverity(severity: Severity) {
  return ({ GREEN: 'NOMINAL', YELLOW: 'REVIEW', ORANGE: 'HIGH RISK', RED: 'CRITICAL' } as const)[severity];
}
function ecgPoints(values: number[]) {
  if (!values.length) return '';
  const width = 680;
  const height = 78;
  const min = Math.min(...values, -0.28);
  const max = Math.max(...values, 1.05);
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index / (values.length - 1)) * width} ${(height - 7) - ((value - min) / (max - min)) * (height - 14)}`).join(' ');
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [crew, setCrew] = useState<Astronaut[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reading, setReading] = useState<VitalReading | null>(null);
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [mode, setMode] = useState<Mode>('NORMAL');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('astrocare-theme') as 'dark' | 'light') ?? 'dark');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);
  const [selectedZone, setSelectedZone] = useState<SelectedZone | null>(null);
  const [markerNote, setMarkerNote] = useState('');
  const [markerSeverity, setMarkerSeverity] = useState<'YELLOW' | 'ORANGE' | 'RED'>('YELLOW');
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastCounter, setToastCounter] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSosDialog, setShowSosDialog] = useState(false);
  const [sosMessage, setSosMessage] = useState('Medical assistance requested.');
  const [sosStatus, setSosStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [navOpen, setNavOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  const isSurgeon = user?.role === 'ROLE_FLIGHT_SURGEON';
  const selected = crew.find((person) => person.id === selectedId) ?? null;
  const openAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED');
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const showToast = useCallback((title: string, message: string, type: Toast['type'] = 'success') => {
    setToastCounter((current) => {
      const id = current + 1;
      setToast({ id, title, message, type });
      window.setTimeout(() => setToast((active) => active?.id === id ? null : active), 4200);
      return id;
    });
  }, []);

  const loadCrew = useCallback(async (activeUser: User) => {
    const result = await api<RosterResponse>('/api/astronauts');
    setCrew(result.astronauts);
    const preferred = activeUser.role === 'ROLE_ASTRONAUT' ? activeUser.astronautId : result.astronauts[0]?.id;
    setSelectedId((current) => current && result.astronauts.some((person) => person.id === current) ? current : (preferred ?? result.astronauts[0]?.id ?? null));
    return result.astronauts;
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const result = await api<NotificationsResponse>('/api/notifications');
      setNotifications(result.notifications);
    } catch { /* Notifications are a secondary view; keep the main console available. */ }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('astrocare-theme', theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    api<LoginResponse>('/api/auth/me').then(async (result) => {
      if (!alive) return;
      setCsrfToken(result.csrfToken);
      setUser(result.user);
      await loadCrew(result.user);
      await loadNotifications();
    }).catch(() => { /* Logged-out state is expected before first sign-in. */ }).finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, [loadCrew, loadNotifications]);

  useEffect(() => {
    if (!user || !selectedId) return;
    let alive = true;
    setConnection('connecting');
    Promise.all([
      api<LatestResponse>(`/api/health/latest/${selectedId}`),
      api<HistoryResponse>(`/api/health/history/${selectedId}?limit=120`),
      api<MarkerResponse>(`/api/anatomy/markers?astronautId=${selectedId}`),
      api<RosterResponse>('/api/astronauts'),
    ]).then(([latest, history, markerResult, roster]) => {
      if (!alive) return;
      setReading(latest.reading);
      setReadings(history.readings);
      setAlerts(latest.alerts);
      setMarkers(markerResult.markers);
      const activeCrew = roster.astronauts;
      setCrew(activeCrew);
      setMode(activeCrew.find((person) => person.id === selectedId)?.mode ?? latest.reading.mode ?? 'NORMAL');
    }).catch((error) => {
      if (alive) showToast('Telemetry unavailable', error instanceof Error ? error.message : 'Reconnect and try again.', 'error');
    });
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const client = new Client({
      brokerURL: `${socketProtocol}//${window.location.host}/ws`,
      reconnectDelay: 2400,
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      debug: () => undefined,
    });
    client.onConnect = () => {
      if (!alive) return;
      setConnection('live');
      client.subscribe(`/topic/telemetry/${selectedId}`, (message) => {
        try {
          const payload = JSON.parse(message.body) as { reading: VitalReading; severity: Severity; mode: Mode; alerts: Alert[] };
          if (!alive) return;
          setReading(payload.reading);
          setMode(payload.mode);
          setAlerts(payload.alerts ?? []);
          setReadings((current) => [...current, payload.reading].slice(-160));
          setCrew((current) => current.map((person) => person.id === selectedId ? { ...person, latest: payload.reading, mode: payload.mode, severity: payload.severity, alertCount: payload.alerts?.length ?? 0 } : person));
        } catch { /* Ignore malformed event frames; next complete sample will refresh the view. */ }
      });
      client.subscribe(`/topic/alerts/${selectedId}`, (message) => {
        try { const payload = JSON.parse(message.body) as { alerts: Alert[] }; if (alive) setAlerts(payload.alerts ?? []); } catch { /* Ignore malformed alert frame. */ }
      });
      if (isSurgeon && user) {
        client.subscribe(`/topic/notifications/${user.id}`, (message) => {
          try {
            const payload = JSON.parse(message.body) as { type?: string; title?: string; message?: string; id?: number; eventCode?: string; createdAt?: string };
            if (!alive) return;
            showToast(payload.type === 'EMERGENCY_SOS' ? 'Emergency SOS received' : (payload.title ?? 'Clinical alert'), payload.message ?? 'New mission notification.', 'warning');
            void loadNotifications();
          } catch { /* Ignore malformed notification frame. */ }
        });
      }
    };
    client.onWebSocketClose = () => { if (alive) setConnection('reconnecting'); };
    client.onStompError = () => { if (alive) setConnection('reconnecting'); };
    client.activate();
    return () => {
      alive = false;
      setConnection('connecting');
      void client.deactivate();
    };
  }, [user, selectedId, isSurgeon, loadNotifications, showToast]);

  async function handleLogin(email: string, password: string) {
    setLoginBusy(true);
    setLoginError('');
    try {
      const result = await api<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setCsrfToken(result.csrfToken);
      setUser(result.user);
      await loadCrew(result.user);
      await loadNotifications();
      showToast('Mission session active', `Signed in as ${result.user.role === 'ROLE_FLIGHT_SURGEON' ? 'Flight Surgeon' : 'Astronaut'}.`, 'success');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally { setLoginBusy(false); }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* Clear the local view even if the session already expired. */ }
    setCsrfToken('');
    setUser(null); setCrew([]); setSelectedId(null); setReading(null); setReadings([]); setAlerts([]); setMarkers([]); setNotifications([]);
  }

  async function chooseMode(nextMode: Mode) {
    if (!selected) return;
    try {
      await api('/api/demo/simulate', { method: 'POST', body: JSON.stringify({ mode: nextMode, astronautId: selected.id }) });
      setMode(nextMode);
      showToast(`${MODE_LABELS[nextMode]} scenario active`, MODE_COPY[nextMode], nextMode === 'CRITICAL' ? 'warning' : 'success');
    } catch (error) { showToast('Scenario not applied', error instanceof Error ? error.message : 'Please retry.', 'error'); }
  }

  async function saveMarker() {
    if (!selected || !selectedZone || markerNote.trim().length < 3) return;
    try {
      await api('/api/anatomy/markers', { method: 'POST', body: JSON.stringify({ astronautId: selected.id, bodyZone: selectedZone.id, coordX: selectedZone.x, coordY: selectedZone.y, severity: markerSeverity, clinicalNote: markerNote.trim() }) });
      setMarkerNote('');
      const updated = await api<MarkerResponse>(`/api/anatomy/markers?astronautId=${selected.id}`);
      setMarkers(updated.markers);
      setSelectedZone(null);
      showToast('Marker saved', 'Clinical note and location stored in the demo medical record.');
    } catch (error) { showToast('Marker not saved', error instanceof Error ? error.message : 'Please retry.', 'error'); }
  }

  async function resolveMarker(marker: Marker) {
    try {
      await api(`/api/anatomy/markers/${marker.id}`, { method: 'PATCH', body: JSON.stringify({ resolved: true }) });
      setMarkers((current) => current.map((item) => item.id === marker.id ? { ...item, resolved: true } : item));
      showToast('Marker resolved', `${marker.bodyZone.replaceAll('_', ' ')} marked resolved.`);
    } catch (error) { showToast('Update failed', error instanceof Error ? error.message : 'Please retry.', 'error'); }
  }

  async function sendSos() {
    setSosStatus('sending');
    try {
      await api('/api/emergency/sos', { method: 'POST', body: JSON.stringify({ message: sosMessage }) });
      setSosStatus('sent');
      setShowSosDialog(false);
      showToast('SOS sent to Flight Surgeon console', 'In-app demo dispatch recorded. No external service was contacted.', 'warning');
      await loadNotifications();
    } catch (error) {
      setSosStatus('idle');
      showToast('SOS could not be sent', error instanceof Error ? error.message : 'Check your connection and retry.', 'error');
    }
  }

  async function exportReport() {
    if (!selected) return;
    try {
      const blob = await api<Blob>(`/api/reports/pdf/${selected.id}`);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `astrocare-${selected.callSign.toLowerCase()}-clinical-demo.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(objectUrl);
      showToast('Clinical PDF exported', 'A synthetic telemetry report was downloaded.');
    } catch (error) { showToast('Export failed', error instanceof Error ? error.message : 'Please retry.', 'error'); }
  }

  async function acknowledge(eventId: number) {
    try {
      await api(`/api/emergency/${eventId}/acknowledge`, { method: 'POST', body: JSON.stringify({}) });
      showToast('SOS acknowledged', 'The in-app event is marked as acknowledged.');
      await loadNotifications();
    } catch (error) { showToast('Acknowledgement failed', error instanceof Error ? error.message : 'Please retry.', 'error'); }
  }

  async function markNotificationRead(notificationId: number) {
    try {
      await api(`/api/notifications/${notificationId}/read`, { method: 'POST', body: JSON.stringify({}) });
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item));
      showToast('Notification marked read', 'Inbox status updated.');
    } catch (error) { showToast('Could not update notification', error instanceof Error ? error.message : 'Please retry.', 'error'); }
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setNavOpen(false);
  }

  const filteredCrew = useMemo(() => crew.filter((person) => `${person.firstName} ${person.lastName} ${person.callSign}`.toLowerCase().includes(filter.toLowerCase())), [crew, filter]);
  const activeFlags = useMemo(() => [...openAlerts].sort((a, b) => ({ RED: 0, ORANGE: 1, YELLOW: 2 }[a.severity] - { RED: 0, ORANGE: 1, YELLOW: 2 }[b.severity])), [openAlerts]);

  if (booting) return <div className="boot-screen"><div className="boot-logo"><Activity size={22} /></div><div className="boot-line" /><span>ASTROCARE · SECURE SESSION CHECK</span></div>;
  if (!user) return <LoginView onLogin={handleLogin} error={loginError} busy={loginBusy} />;
  if (!selected) return <div className="boot-screen"><div className="boot-logo"><Activity size={22} /></div><span>LOADING CREW HEALTH RECORDS</span></div>;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={`sidebar ${navOpen ? 'nav-open' : ''}`}>
        <div className="sidebar-brand"><span className="brand-mark"><Activity size={18} /></span><span className="brand-name">ASTRO<span>CARE</span></span><button className="mobile-close icon-button" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={17} /></button></div>
        <div className="side-label">MISSION CONSOLE</div>
        <nav className="primary-nav" aria-label="Mission console navigation">
          <button className="nav-item active" onClick={() => scrollTo('overview')}><Gauge size={17} /><span>Mission overview</span><span className="nav-indicator" /></button>
          <button className="nav-item" onClick={() => scrollTo('telemetry')}><Activity size={17} /><span>Live telemetry</span></button>
          <button className="nav-item" onClick={() => scrollTo('anatomy')}><Crosshair size={17} /><span>Anatomy & markers</span></button>
          <button className="nav-item" onClick={() => scrollTo('clinical')}><Shield size={17} /><span>Clinical flags</span>{openAlerts.length > 0 && <span className="nav-count">{openAlerts.length}</span>}</button>
        </nav>
        <div className="sidebar-rule" />
        <div className="crew-header"><div><div className="side-label">ACTIVE CREW</div><div className="crew-count">{isSurgeon ? `${crew.length.toString().padStart(2, '0')} MEMBERS` : 'PERSONAL RECORD'}</div></div><span className="crew-live"><i /> LIVE</span></div>
        {isSurgeon && <div className="crew-search"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a crew member" aria-label="Find crew member" /><kbd>⌘ K</kbd></div>}
        <div className="crew-list">
          {(isSurgeon ? filteredCrew : filteredCrew.filter((person) => person.id === user.astronautId)).map((person, index) => (
            <button key={person.id} className={`crew-row ${selectedId === person.id ? 'selected' : ''}`} onClick={() => { setSelectedId(person.id); setSelectedZone(null); }}>
              <div className={`avatar avatar-${person.avatarTone}`}><span>{initials(person)}</span><i className={`status-dot ${person.severity.toLowerCase()}`} /></div>
              <div className="crew-details"><strong>{person.firstName} {person.lastName}</strong><small>{person.callSign} <span>·</span> {person.title}</small></div>
              {person.alertCount > 0 ? <span className="crew-alert-count">{person.alertCount}</span> : <ChevronRight className="crew-arrow" size={14} />}
            </button>
          ))}
          {isSurgeon && filteredCrew.length === 0 && <div className="crew-empty">No crew match that search.</div>}
        </div>
        <div className="sidebar-bottom">
          <div className="mission-card"><div className="mission-card-top"><span><span className="mission-orbit"><Activity size={14} /></span> MISSION STATUS</span><i className="signal-dot" /></div><strong>{selected.missionName}</strong><div className="mission-card-meta"><span>{selected.missionPhase.replaceAll('_', ' ')}</span><span>DEMO MISSION</span></div><div className="mission-progress"><i /></div><div className="mission-progress-label"><span>HEALTH COVERAGE</span><strong>96.8%</strong></div></div>
          <div className="sidebar-user"><div className="avatar avatar-surgeon"><span>{user.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span></div><div className="sidebar-user-info"><strong>{user.displayName}</strong><small>{isSurgeon ? 'FLIGHT SURGEON' : 'ASTRONAUT'}</small></div><button className="icon-button sidebar-logout" onClick={() => void logout()} aria-label="Sign out"><LogOut size={15} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>FLIGHT MEDICINE</span><ChevronRight size={13} /><strong>MISSION OVERVIEW</strong></div>
          <div className="topbar-right">
            <div className={`connection-pill ${connection}`}><span className="connection-dot" /><strong>{connection === 'live' ? 'STREAM ACTIVE' : connection === 'connecting' ? 'CONNECTING' : 'RECONNECTING'}</strong><i>·</i><span>DEMO DATA</span></div>
            <div className="topbar-divider" />
            <div className="utc-clock"><Clock3 size={14} /><span>{now.toISOString().slice(11, 19)} UTC</span></div>
            <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <div className="notification-anchor">
              <button className={`icon-button notification-button ${showNotifications ? 'is-open' : ''}`} onClick={() => setShowNotifications((current) => !current)} aria-label="Notifications"><Bell size={17} />{unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
              {showNotifications && (
                <div className="notification-menu">
                  <div className="notification-menu-head">
                    <div><span className="micro-label">INBOX</span><strong>Mission notifications</strong></div>
                    <button className="icon-button" onClick={() => setShowNotifications(false)} aria-label="Close notifications"><X size={15} /></button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="notification-empty"><Bell size={18} /><span>No notifications yet</span><small>New flags and SOS events appear here.</small></div>
                  ) : notifications.slice(0, 6).map((item) => (
                    <div className={`notification-row ${!item.readAt ? 'unread' : ''}`} key={item.id}>
                      <i className={item.emergencyEventId ? 'event-icon sos-icon' : 'event-icon'}>{item.emergencyEventId ? <Siren size={14} /> : <AlertTriangle size={14} />}</i>
                      <div><strong>{item.title}</strong><p>{item.message}</p><small>{formatRelative(item.createdAt)}</small></div>
                      <div className="notification-actions">
                        {!item.readAt && <button className="mark-read-button" onClick={() => void markNotificationRead(item.id)} aria-label={`Mark ${item.title} as read`}>MARK READ</button>}
                        {item.emergencyEventId && isSurgeon && <button className="ack-button" onClick={() => void acknowledge(Number(item.emergencyEventId))}>ACK SOS</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <div className="role-chip"><span className={`role-chip-icon ${isSurgeon ? 'surgeon' : 'astronaut'}`}>{isSurgeon ? <Shield size={14} /> : <UserRound size={14} />}</span><span>{isSurgeon ? 'SURGEON' : 'ASTRONAUT'}</span><ChevronDown size={13} /></div>
          </div>
        </header>

        <div className="content-wrap" id="overview">
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> HEALTH OPERATIONS <span className="eyebrow-slash">/</span> {selected.missionName.toUpperCase()}</div><h1>{isSurgeon ? 'Crew health overview' : 'Your health cockpit'}</h1><p>{isSurgeon ? 'A unified view of crew physiology, mission context, and clinical attention.' : 'Your personal telemetry stream and mission health information.'}</p></div>
            <div className="heading-actions">
              {isSurgeon ? <div className="simulation-badge"><Sparkles size={14} /><span>SIMULATION</span><i>·</i><strong>{MODE_LABELS[mode]}</strong></div> : <button className={`button-sos ${sosStatus === 'sent' ? 'sent' : ''}`} onClick={() => setShowSosDialog(true)}><Siren size={15} />{sosStatus === 'sent' ? 'SOS RECORDED' : 'EMERGENCY SOS'}</button>}
              <button className="button-outline report-button" onClick={() => void exportReport()}><Download size={15} /><span>Export clinical PDF</span></button>
            </div>
          </div>

          <section className="hero-panel glass-panel">
            <div className="hero-grid-glow" />
            <div className="hero-identity"><div className={`hero-avatar avatar-${selected.avatarTone}`}><span>{initials(selected)}</span><i className={`status-dot ${selected.severity.toLowerCase()}`} /></div><div className="hero-name-block"><div className="hero-topline"><span className="call-sign">{selected.callSign}</span><span className="role-label">{selected.title.toUpperCase()}</span><span className="mission-phase"><i />{selected.missionPhase.replaceAll('_', ' ')}</span></div><h2>{selected.firstName} <span>{selected.lastName}</span></h2><div className="hero-meta"><span><Users size={13} /> {selected.missionName}</span><span className="hero-meta-divider" /><span><MapPin size={13} /> ORBITAL REFERENCE · DEMO</span></div></div></div>
            <div className="hero-vitals"><div className="hero-vital"><span>MISSION DAY</span><strong>03<span> / 04</span></strong><small>IN FLIGHT</small></div><div className="hero-vital"><span>HEALTH STATUS</span><strong className={`hero-status text-${selected.severity.toLowerCase()}`}>{labelSeverity(selected.severity)}</strong><small>{openAlerts.length ? `${openAlerts.length} OPEN FLAG${openAlerts.length === 1 ? '' : 'S'}` : 'NO ACTIVE FLAGS'}</small></div><div className="hero-vital"><span>LAST SYNC</span><strong className="hero-sync"><i className="live-pulse" />{reading ? formatClock(reading.recordedAt).replace(' Z', '') : '--:--:--'}</strong><small>{connection === 'live' ? 'TELEMETRY STREAM' : 'WAITING FOR LINK'}</small></div></div>
            <div className="hero-orbit-mark"><span>AC</span><i /><i /><i /></div>
          </section>

          {isSurgeon && <section className="scenario-strip glass-panel" aria-label="Demo simulator controls"><div className="scenario-intro"><div className="scenario-orbit"><Sparkles size={16} /></div><div><span className="micro-label">FLIGHT SURGEON TOOL</span><strong>Demo simulator</strong><small>Scenario changes the live crew stream</small></div></div><div className="scenario-actions">{MODE_ORDER.map((scenario) => { const Icon = MODE_ICONS[scenario]; return <button key={scenario} className={`scenario-button scenario-${scenario.toLowerCase()} ${mode === scenario ? 'active' : ''}`} onClick={() => void chooseMode(scenario)} aria-pressed={mode === scenario}><Icon size={15} /><span>{MODE_LABELS[scenario]}</span>{mode === scenario && <i className="scenario-active-dot" />}</button>; })}</div><div className="scenario-note"><span>2s</span> telemetry cycle</div></section>}

          <section className="metrics-grid" id="telemetry" aria-label="Current vital signs">
            <MetricCard metric="heartRate" reading={reading} values={readings} onClick={() => setSelectedMetric('heartRate')} />
            <MetricCard metric="spo2" reading={reading} values={readings} onClick={() => setSelectedMetric('spo2')} />
            <MetricCard metric="bloodPressure" reading={reading} values={readings} onClick={() => setSelectedMetric('bloodPressure')} />
            <MetricCard metric="coreTemperatureC" reading={reading} values={readings} onClick={() => setSelectedMetric('coreTemperatureC')} />
            <MetricCard metric="respiratoryRate" reading={reading} values={readings} onClick={() => setSelectedMetric('respiratoryRate')} />
          </section>

          <div className="dashboard-grid">
            <div className="main-column">
              <section className="panel telemetry-panel glass-panel">
                <div className="chart-legend-note"><span><i className="legend-line hr" /> HEART RATE <small>bpm</small></span><span><i className="legend-line o2" /> SpO₂ <small>%</small></span><span className="chart-units-note">DUAL AXIS · 2 SECOND REFRESH</span></div>
                <TelemetryChart readings={readings} metric="all" theme={theme} />
                <div className="chart-footer"><span><span className="chart-range-dot" /> SAMPLED LIVE · SYNTHETIC TELEMETRY</span><span>{readings.length} POINTS <i /> {reading ? formatClock(reading.recordedAt) : 'WAITING FOR SAMPLE'}</span></div>
              </section>

              <section className="panel signal-panel glass-panel">
                <div className="panel-heading signal-heading"><div><div className="panel-kicker"><span className="section-dot blue" /> ELECTROCARDIOGRAM <span className="panel-separator">/</span> LEAD II</div><h3>Cardiac rhythm trace</h3></div><div className="ecg-readout"><span>RATE</span><strong>{reading?.heartRate ?? '--'} <small>BPM</small></strong></div><span className="ecg-badge">DEMO WAVEFORM</span></div>
                <div className="ecg-canvas"><div className="ecg-grid" /><svg viewBox="0 0 680 78" preserveAspectRatio="none" role="img" aria-label="Synthetic ECG Lead II waveform"><path className="ecg-line" d={ecgPoints(reading?.ecgLeadIi ?? [])} /></svg><div className="ecg-axis"><span>LEAD II</span><span>WAVEFORM · SYNTHETIC</span><span>80 SAMPLES</span></div></div>
              </section>

              <section className="panel secondary-metrics glass-panel">
                <div className="secondary-heading"><div><div className="panel-kicker"><span className="section-dot orange" /> EVA & ENVIRONMENT</div><h3>Suit & radiation telemetry</h3></div><span className="small-tag">MISSION ENVIRONMENT</span></div>
                <div className="secondary-grid"><SecondaryMetric metric="evaSuitPressurePsi" reading={reading} values={readings} onClick={() => setSelectedMetric('evaSuitPressurePsi')} /><div className="secondary-divider" /><SecondaryMetric metric="radiationMsvH" reading={reading} values={readings} onClick={() => setSelectedMetric('radiationMsvH')} /><div className="secondary-divider" /><div className="secondary-info"><span>SUIT INTEGRITY</span><strong className={reading && reading.evaSuitPressurePsi < 3.3 ? 'text-orange' : 'text-teal'}>{reading && reading.evaSuitPressurePsi < 3.3 ? 'REVIEW' : 'NOMINAL'}</strong><small>Countermeasure channel</small></div></div>
              </section>
            </div>

            <aside className="right-column">
              <section className="panel alerts-panel glass-panel" id="clinical">
                <div className="panel-heading alerts-heading"><div><div className="panel-kicker"><span className="section-dot orange" /> CLINICAL CONTEXT</div><h3>Rule-engine flags</h3></div><span className={`alert-count-pill ${openAlerts.length ? 'has-alerts' : ''}`}>{openAlerts.length.toString().padStart(2, '0')} OPEN</span></div>
                <div className="alert-safety-note"><Shield size={13} /> Configurable demo rules · not diagnoses</div>
                <div className="alert-list">{activeFlags.length === 0 ? <div className="no-alerts"><div className="no-alert-icon"><Check size={17} /></div><strong>No active flags</strong><span>Rule engine is monitoring synthetic readings.</span></div> : activeFlags.map((alert) => <AlertRow key={alert.id} alert={alert} />)}</div>
                <div className="panel-bottom-link"><span>PATHOLOGY MONITOR</span><span>{openAlerts.length ? 'REVIEW REQUIRED' : 'ALL CLEAR'} <ArrowRight size={13} /></span></div>
              </section>

              <section className="panel body-panel glass-panel" id="anatomy">
                <div className="panel-heading anatomy-heading"><div><div className="panel-kicker"><span className="section-dot" /> CLINICAL MAPPING</div><h3>Anatomy & markers</h3></div><span className="marker-total"><MapPin size={13} />{markers.filter((marker) => !marker.resolved).length.toString().padStart(2, '0')}</span></div>
                <div className="body-panel-body"><AnatomyMap markers={markers} alerts={openAlerts} onSelect={setSelectedZone} canEdit={isSurgeon} compact /></div>
                <div className="body-panel-foot"><span><Crosshair size={13} /> SELECT A BODY ZONE</span>{isSurgeon ? <span className="marker-capability">MARKER PINNING ON</span> : <span className="marker-capability muted">SURGEON MARKERS</span>}</div>
                {isSurgeon && selectedZone && <div className="marker-editor"><div className="marker-editor-head"><strong><MapPin size={14} /> {selectedZone.label}</strong><button className="icon-button" onClick={() => setSelectedZone(null)} aria-label="Cancel marker"><X size={14} /></button></div><div className="severity-options">{(['YELLOW', 'ORANGE', 'RED'] as const).map((severity) => <button key={severity} className={`severity-choice ${severity.toLowerCase()} ${markerSeverity === severity ? 'active' : ''}`} onClick={() => setMarkerSeverity(severity)}>{severity}</button>)}</div><textarea value={markerNote} onChange={(event) => setMarkerNote(event.target.value)} placeholder="Clinical note · 3 characters minimum" maxLength={1200} rows={2} /><button className="button-primary save-marker" onClick={() => void saveMarker()} disabled={markerNote.trim().length < 3}><Plus size={14} /> SAVE MARKER</button></div>}
                {markers.filter((marker) => !marker.resolved).length > 0 && <div className="marker-record-list">{markers.filter((marker) => !marker.resolved).slice(0, 3).map((marker) => <div className="marker-record" key={marker.id}><i className={`marker-record-dot ${marker.severity.toLowerCase()}`} /><div><strong>{marker.bodyZone.replaceAll('_', ' ')}</strong><small>{marker.clinicalNote}</small></div>{isSurgeon && <button className="resolve-marker" onClick={() => void resolveMarker(marker)} title="Resolve marker"><Check size={13} /></button>}</div>)}</div>}
              </section>

              <section className="panel quick-context glass-panel"><div className="quick-context-title"><div className="panel-kicker"><span className="section-dot blue" /> MISSION READOUT</div><button className="panel-more" aria-label="Mission readout details"><ChevronDown size={14} /></button></div><div className="quick-row"><span><Clock3 size={14} /> Telemetry interval</span><strong>2.0 sec</strong></div><div className="quick-row"><span><Radio size={14} /> Data source</span><strong className="text-teal">SIMULATED</strong></div><div className="quick-row"><span><ShieldAlert size={14} /> Active scenario</span><strong>{MODE_LABELS[mode]}</strong></div><div className="quick-context-note">Threshold provenance and NASA OSDR scope are documented in the project README.</div></section>
            </aside>
          </div>

          <section className="clinical-footnote"><Shield size={14} /><div><strong>DEMO DATA · NOT FOR CLINICAL USE</strong><span>Physiological readings and rules are synthetic. OSDR references do not provide a validated continuous stream for all displayed fields. No external flight-control or emergency service is connected.</span></div><button onClick={() => scrollTo('clinical')}>Rule engine details <ArrowRight size={13} /></button></section>
          <footer className="app-footer"><span>ASTROCARE MISSION HEALTH CONSOLE <i /> DEMO BUILD 01.26</span><span>ROLE-BASED · PERSISTENT DEMO RECORDS · <span className={`footer-connection ${connection}`}><i />{connection === 'live' ? 'WEBSOCKET LINK ACTIVE' : 'LINK ' + connection.toUpperCase()}</span></span></footer>
        </div>
      </main>

      {selectedMetric && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedMetric(null)}><section className="metric-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="metric-modal-title" onClick={(event) => event.stopPropagation()}><div className="metric-modal-head"><div><div className="panel-kicker"><span className="section-dot" /> HISTORICAL TELEMETRY · {selected.callSign}</div><h2 id="metric-modal-title">{chartMetrics[selectedMetric].label}</h2></div><button className="icon-button" onClick={() => setSelectedMetric(null)} aria-label="Close chart"><X size={17} /></button></div><div className="metric-modal-value"><strong>{valueFor(selectedMetric, reading)}</strong><span>{chartMetrics[selectedMetric].unit}</span><em className={`status-text ${severityFor(selectedMetric, reading).toLowerCase()}`}>{labelSeverity(severityFor(selectedMetric, reading))}</em></div><TelemetryChart readings={readings} metric={selectedMetric} theme={theme} /><div className="modal-note"><Shield size={13} /> Historical series are synthetic demonstration telemetry and are not clinical guidance.</div></section></div>}

      {showSosDialog && <div className="modal-backdrop" role="presentation" onClick={() => setShowSosDialog(false)}><section className="sos-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="sos-title" onClick={(event) => event.stopPropagation()}><div className="sos-modal-icon"><Siren size={24} /></div><button className="icon-button sos-close" onClick={() => setShowSosDialog(false)} aria-label="Close SOS form"><X size={16} /></button><div className="panel-kicker">EMERGENCY RESPONSE · DEMO</div><h2 id="sos-title">Send medical SOS?</h2><p>This creates a persistent in-app event and notifies the Flight Surgeon console. No external emergency service is contacted.</p><label htmlFor="sos-message">MESSAGE TO FLIGHT SURGEON</label><textarea id="sos-message" rows={3} value={sosMessage} onChange={(event) => setSosMessage(event.target.value)} maxLength={1000} /><button className="button-sos sos-confirm" disabled={sosStatus === 'sending'} onClick={() => void sendSos()}>{sosStatus === 'sending' ? 'SENDING…' : <><Siren size={15} /> SEND DEMO SOS <ArrowRight size={15} /></>}</button><span className="sos-context"><Shield size={12} /> RECORD WILL BE VISIBLE IN FLIGHT SURGEON INBOX</span></section></div>}

      {toast && <div className={`toast toast-${toast.type}`} role="status"><span className="toast-icon">{toast.type === 'success' ? <Check size={16} /> : toast.type === 'warning' ? <Siren size={16} /> : <CircleHelp size={16} />}</span><span><strong>{toast.title}</strong><small>{toast.message}</small></span><button className="icon-button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}

function MetricCard({ metric, reading, values, onClick }: { metric: MetricKey; reading: VitalReading | null; values: VitalReading[]; onClick: () => void }) {
  const meta = chartMetrics[metric];
  const Icon = meta.icon;
  const severity = severityFor(metric, reading);
  const previous = values.length > 1 ? values[values.length - 2] : null;
  const current = metric === 'bloodPressure' ? (reading?.systolicBp ?? 0) : reading ? Number(reading[metric]) : 0;
  const prior = metric === 'bloodPressure' ? (previous?.systolicBp ?? current) : previous ? Number(previous[metric]) : current;
  const up = current > prior;
  return (
    <button className={`metric-card glass-panel metric-${meta.color} severity-${severity.toLowerCase()}`} onClick={onClick} title={`Open ${meta.label} history`}>
      <div className="metric-head"><span className="metric-label">{meta.label.toUpperCase()}</span><span className="metric-icon"><Icon size={16} /></span></div>
      <div className="metric-value"><strong>{valueFor(metric, reading)}</strong><span>{meta.unit}</span></div>
      <div className="metric-foot"><span className={`metric-status ${severity.toLowerCase()}`}><i />{labelSeverity(severity)}</span><span className={`metric-trend ${up ? 'trend-up' : 'trend-down'}`}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} LIVE</span></div>
      <div className="metric-sparkline"><Spark values={values.slice(-18).map((item) => metric === 'bloodPressure' ? item.systolicBp : Number(item[metric]))} color={severity === 'RED' || severity === 'ORANGE' ? 'var(--danger)' : severity === 'YELLOW' ? 'var(--warning)' : meta.color === 'blue' ? 'var(--blue)' : 'var(--brand)'} /></div>
      <span className="metric-open"><ExternalLink size={12} /></span>
    </button>
  );
}

function SecondaryMetric({ metric, reading, values, onClick }: { metric: 'evaSuitPressurePsi' | 'radiationMsvH'; reading: VitalReading | null; values: VitalReading[]; onClick: () => void }) {
  const meta = chartMetrics[metric];
  const Icon = meta.icon;
  const severity = severityFor(metric, reading);
  return <button className={`secondary-metric ${severity.toLowerCase()}`} onClick={onClick}><span className="secondary-icon"><Icon size={17} /></span><div><span>{meta.label.toUpperCase()}</span><strong>{valueFor(metric, reading)} <small>{meta.unit}</small></strong><em>{labelSeverity(severity)}</em></div><span className="secondary-mini"><Spark values={values.slice(-14).map((item) => Number(item[metric]))} color={severity === 'GREEN' ? 'var(--brand)' : 'var(--warning)'} /></span></button>;
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const range = max - min || 1;
  const points = values.map((value, index) => `${index / Math.max(values.length - 1, 1) * 100},${30 - ((value - min) / range) * 25}`).join(' ');
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>;
}

function AlertRow({ alert }: { alert: Alert }) {
  const severe = alert.severity === 'RED' || alert.severity === 'ORANGE';
  return <div className={`alert-row alert-${alert.severity.toLowerCase()}`}><span className="alert-row-icon">{severe ? <AlertTriangle size={15} /> : <Eye size={15} />}</span><div className="alert-row-content"><div className="alert-row-title"><strong>{alert.title}</strong><span>{alert.severity}</span></div><p>{alert.description}</p><div className="alert-row-meta"><span><MapPin size={11} />{alert.bodyZone.replaceAll('_', ' ')}</span><span>{formatRelative(alert.createdAt)}</span></div></div></div>;
}
