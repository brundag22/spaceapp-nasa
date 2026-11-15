import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from './types/astrocare';
import { TopBar } from './components/TopBar';
import { LoginPortal } from './components/LoginPortal';
import { MissionWorkspace } from './components/MissionWorkspace';
import { stompService } from './lib/stompClient';

const STORAGE_THEME_KEY = 'astrocare_theme';
const STORAGE_SESSION_KEY = 'astrocare_session';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SESSION_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as { user?: AuthUser };
      return parsed.user ?? null;
    } catch {
      return null;
    }
  });

  const [activeSection, setActiveSection] = useState<string>('overview');
  const loginSectionRef = useRef<HTMLDivElement | null>(null);

  // Sync .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLoginSuccess = (authedUser: AuthUser, token: string) => {
    setUser(authedUser);
    setActiveSection('overview');
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify({ user: authedUser, token }));
  };

  const handleSignOut = () => {
    void stompService.disconnect(false);
    localStorage.removeItem(STORAGE_SESSION_KEY);
    setUser(null);
    setActiveSection('capabilities');
  };

  const handleNavigate = (section: string) => {
    setActiveSection(section);
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleFocusLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const emailInput = document.getElementById('astro-email');
    emailInput?.focus();
  };

  return (
    <div
      id="top"
      className="min-h-screen bg-white dark:bg-[#07090E] text-slate-900 dark:text-slate-100 astro-grid-bg flex flex-col"
    >
      <TopBar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        user={user}
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onSignOut={handleSignOut}
        onFocusLogin={handleFocusLogin}
      />

      <div className="flex-1">
        {user ? (
          <MissionWorkspace
            user={user}
            theme={theme}
            activeSection={activeSection}
          />
        ) : (
          <LoginPortal
            onLoginSuccess={handleLoginSuccess}
            loginSectionRef={loginSectionRef}
          />
        )}
      </div>

      <footer className="border-t border-slate-200/80 dark:border-white/15 py-5 mt-12">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>AstroCare Orbital Biomedical Telemetry</span>
          <span className="font-mono-tabular">
            {user ? `Authenticated Session · ${user.callsign}` : 'Flight Surgeon & Crew Portal'}
          </span>
        </div>
      </footer>
    </div>
  );
}
