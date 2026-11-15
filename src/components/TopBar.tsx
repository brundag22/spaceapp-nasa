import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { AuthUser } from '../types/astrocare';

interface TopBarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  user: AuthUser | null;
  activeSection: string;
  onNavigate: (section: string) => void;
  onSignOut: () => void;
  onFocusLogin: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  theme,
  onToggleTheme,
  user,
  activeSection,
  onNavigate,
  onSignOut,
  onFocusLogin,
}) => {
  const navItems = user
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'telemetry', label: 'Telemetry' },
        { id: 'anatomy', label: 'Diagnostics' },
        { id: 'reports', label: 'Reports' },
      ]
    : [
        { id: 'capabilities', label: 'Capabilities' },
        { id: 'architecture', label: 'Architecture' },
        { id: 'portal', label: 'Clinical Portal' },
      ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-white/20 bg-white/85 dark:bg-[#07090E]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark (single-line, no auxiliary pills) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onNavigate(user ? 'overview' : 'capabilities');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-sm"
        >
          AstroCare
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                  isActive
                    ? 'border-cyan-500 text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Toggle & Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to Light Glass Theme' : 'Switch to Dark Obsidian Theme'}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300/80 dark:border-white/22 bg-slate-100/80 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-200/80 dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-slate-700" />}
            <span>{theme === 'dark' ? 'Light Glass' : 'Dark Obsidian'}</span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg bg-slate-900 dark:bg-white px-4 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={onFocusLogin}
              className="rounded-lg bg-cyan-600 dark:bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-cyan-500 dark:hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              Mission Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
