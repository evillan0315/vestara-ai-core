/**
 * VES-UI-001 T4: LoginScreen
 *
 * Split-card login promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/components/LoginScreen.tsx`).
 * Modes `default / locked / switch` mirror the prototype `LoginMode`.
 *
 * Sanitized on promotion:
 * - No hardcoded operator identity (plan fixture note) — the user card
 *   resolves the real actor from `useAuth` (`user.username ?? actor`);
 *   `desktopShellUserFixture` is a shape placeholder only.
 * - No version strings (plan G11) — the footer carries the workspace id
 *   from `desktopShellWorkspaceFixture`, never `v7.15.112 FINAL`.
 * - No hardcoded arrays in JSX — brand-panel highlights resolve titles
 *   from `desktopShellPackagesFixture` via `desktopShellLoginHighlightsFixture`.
 * - No lucide-react — MUI icons only (matches existing `AppHeader` imports).
 * - No CDN fonts — the serif display face comes from `--ds-font-serif`.
 *
 * Auth contract: Enter (or `Continue → Desktop`) submits via `onLogin`.
 * `switch` mode edits the session actor through `useAuth().setActor`
 * before submitting. Biometric / skip are explicit non-auth demo paths
 * (`onBiometric` / `onSkip`, defaulting to `onLogin`).
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T4 Boot + Login + state machine)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §5
 */

import { useState } from 'react';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import { VestaraMark } from '../../components/branding/VestaraMark';
import { useAuth } from '../../lib/auth';
import { StartupWallpaper } from '../startup/components/StartupWallpaper';
import {
  desktopShellLoginHighlightsFixture,
  desktopShellPackagesFixture,
  desktopShellUserFixture,
  desktopShellWorkspaceFixture,
} from './desktop-shell.fixtures';
import type { LoginMode, WinType } from './types';
import './desktop-shell.tokens.css';

export interface LoginScreenProps {
  readonly mode: LoginMode;
  readonly onLogin: () => void;
  /** Biometric demo path — explicit non-auth entry, defaults to `onLogin`. */
  readonly onBiometric?: () => void;
  /** Skip demo path — explicit non-auth entry, defaults to `onLogin`. */
  readonly onSkip?: () => void;
}

const LOGIN_HIGHLIGHT_ICONS: Partial<Record<WinType, typeof TerminalOutlinedIcon>> = {
  terminal: TerminalOutlinedIcon,
  activity: ForumRoundedIcon,
  marketplace: StorefrontRoundedIcon,
};

/**
 * Derive avatar initials from a display name (`Ada Lovelace` → `AL`).
 * Falls back to the fixture placeholder when the name is blank.
 */
export function loginInitialsFor(displayName: string): string {
  const initials = displayName
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
  return initials || desktopShellUserFixture.initials;
}

function loginTitleFor(mode: LoginMode): string {
  if (mode === 'locked') return 'Locked';
  if (mode === 'switch') return 'Switch User';
  return 'Welcome back';
}

function loginCaptionFor(mode: LoginMode): string {
  if (mode === 'locked') return 'Enter password to unlock';
  if (mode === 'switch') return 'Choose who signs in to this desktop';
  return 'Secure login to Vestara Desktop';
}

export function LoginScreen({ mode, onLogin, onBiometric, onSkip }: LoginScreenProps) {
  const { user, actor, setActor } = useAuth();
  const displayName = user?.username || actor || desktopShellUserFixture.displayName;
  const [password, setPassword] = useState('');
  const [pendingActor, setPendingActor] = useState(displayName);
  const handleBiometric = onBiometric ?? onLogin;
  const handleSkip = onSkip ?? onLogin;

  const submit = () => {
    if (mode === 'switch' && pendingActor.trim()) {
      setActor(pendingActor.trim());
    }
    onLogin();
  };

  const highlights = desktopShellLoginHighlightsFixture.map(
    (id) => desktopShellPackagesFixture.find((pkg) => pkg.id === id) ?? desktopShellPackagesFixture[0],
  );

  return (
    <div className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden bg-[var(--ds-canvas-bg)]">
      <StartupWallpaper />
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--ds-canvas-bg)] opacity-65 backdrop-blur-[20px]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[var(--ds-canvas-bg)] via-transparent to-[var(--ds-canvas-bg)] opacity-60"
      />
      <div className="relative z-10 grid h-[560px] max-h-[88vh] w-[960px] max-w-[92vw] grid-cols-1 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] opacity-85 shadow-[var(--ds-window-shadow)] backdrop-blur-xl md:grid-cols-[45%_55%]">
        <div className="relative flex flex-col justify-between border-[var(--ds-border)] bg-[var(--ds-surface-bg)] p-8 max-md:border-b md:border-r">
          <div>
            <div className="flex items-center gap-3">
              <VestaraMark size={44} />
              <div>
                <div className="text-[length:var(--vestara-font-size-xs)] font-bold tracking-[0.08em] text-[var(--ds-text)]">
                  VESTARA
                </div>
                <div className="-mt-0.5 text-[length:var(--vestara-font-size-xs)] tracking-[0.22em] text-[var(--ds-text-muted)]">
                  SHELL OS
                </div>
              </div>
              <div aria-hidden="true" className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ds-success)]" />
            </div>
            <div className="mt-8">
              <div className="text-[length:var(--vestara-font-size-page-title)] leading-[1.1] text-[var(--ds-text)] font-[family-name:var(--ds-font-serif)]">
                First-class
                <br />
                Desktop Shell
              </div>
              <div className="mt-3 max-w-[220px] text-[length:var(--vestara-font-size-xs)] leading-5 text-[var(--ds-text-secondary)]">
                Draggable Workspace
                <br />
                Wired Packages
                <br />
                Teal V identity system
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-3">
              {highlights.map((pkg) => {
                const Icon = LOGIN_HIGHLIGHT_ICONS[pkg.id] ?? TerminalOutlinedIcon;
                return (
                  <div
                    key={pkg.id}
                    className="flex items-center gap-3 rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)]">
                      <Icon fontSize="small" aria-hidden="true" className="text-[var(--ds-text-muted)]" />
                    </div>
                    <div>
                      <div className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--ds-text)]">
                        {pkg.title}
                      </div>
                      <div className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
                        {pkg.subtitle}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-6 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            {desktopShellWorkspaceFixture} • teal identity • 32px header • drag shell
          </div>
        </div>

        <div className="flex flex-col justify-center p-8">
          <div className="mb-6">
            <div className="text-[length:var(--vestara-font-size-page-title)] font-medium text-[var(--ds-text)] font-[family-name:var(--ds-font-serif)]">
              {loginTitleFor(mode)}, {displayName}.
            </div>
            <div className="mt-1 text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
              {loginCaptionFor(mode)} • {desktopShellWorkspaceFixture}
            </div>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center gap-3 rounded-[var(--vestara-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-2.5">
              <div
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ds-accent)] text-[length:var(--vestara-font-size-xs)] font-bold text-[var(--vestara-on-accent)]"
              >
                {loginInitialsFor(mode === 'switch' ? pendingActor : displayName)}
              </div>
              <div>
                <div className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--ds-text)]">
                  {mode === 'switch' ? pendingActor || displayName : displayName}
                </div>
                <div className="flex items-center gap-1 text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ds-success)]" />
                  Online
                </div>
              </div>
            </div>
            {mode === 'switch' ? (
              <div>
                <label
                  htmlFor="desktop-shell-username"
                  className="font-mono text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]"
                >
                  USERNAME
                </label>
                <input
                  id="desktop-shell-username"
                  value={pendingActor}
                  onChange={(event) => setPendingActor(event.target.value)}
                  type="text"
                  autoComplete="username"
                  placeholder={desktopShellUserFixture.displayName}
                  className="mt-1.5 h-10 w-full rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-canvas-bg)] px-3 text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-focus-ring)]"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="desktop-shell-password"
                  className="font-mono text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]"
                >
                  PASSWORD
                </label>
                <input
                  id="desktop-shell-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === 'locked' ? 'current-password' : 'current-password'}
                  placeholder="••••••••"
                  className="mt-1.5 h-10 w-full rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-canvas-bg)] px-3 text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-focus-ring)]"
                />
              </div>
            )}
            <button
              type="submit"
              className="h-11 w-full rounded-[var(--vestara-radius-md)] bg-[var(--ds-accent)] text-[length:var(--vestara-font-size-xs)] font-bold tracking-wide text-[var(--vestara-on-accent)] transition hover:brightness-105"
            >
              Continue → Desktop
            </button>
            <div className="flex justify-between font-mono text-[length:var(--vestara-font-size-xs)]">
              <button
                type="button"
                data-testid="login-biometric"
                onClick={handleBiometric}
                aria-label="Sign in with biometrics (demo path, bypasses password)"
                className="text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
              >
                Biometric • Touch ID
              </button>
              <button
                type="button"
                data-testid="login-skip"
                onClick={handleSkip}
                aria-label="Skip login and open the desktop (demo path, no session)"
                className="text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
              >
                Skip to Desktop
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
