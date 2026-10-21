import { Activity, Store, Terminal } from 'lucide-react';
import { useState } from 'react';
import { loginAssistant } from '../lib/assistant-api';
import { clearAssistantToken, storeAssistantToken } from '../lib/auth';
import { SHELL_USER } from '../lib/desktop.fixtures';
import { LOGIN_FOOTER, LOGIN_PREVIEW_CARDS, type LoginPreviewIcon } from '../lib/login.fixtures';
import type { LoginMode } from '../lib/types';
import { VestaraLogoTeal } from './VestaraLogoTeal';

const PREVIEW_ICONS: Record<LoginPreviewIcon, typeof Terminal> = {
  terminal: Terminal,
  activity: Activity,
  store: Store,
};

export function LoginScreen({ onLogin, mode }: { onLogin: () => void; mode: LoginMode }) {
  const [pwd, setPwd] = useState('');
  const [username, setUsername] = useState('eddie');
  const [signingIn, setSigningIn] = useState(false);
  const [authNote, setAuthNote] = useState<string | null>(null);
  const title = mode === 'locked' ? 'Locked' : mode === 'switch' ? 'Switch User' : 'Welcome back';

  // Live login attempt — never blocks entry. The API auto-registers unknown
  // usernames; on any failure the shell continues offline (fixture mode).
  const handleContinue = async () => {
    setSigningIn(true);
    setAuthNote(null);
    try {
      const session = await loginAssistant(username.trim() || 'eddie');
      storeAssistantToken(session.token);
    } catch {
      clearAssistantToken();
      setAuthNote('API unreachable — continuing offline.');
    } finally {
      setSigningIn(false);
      onLogin();
    }
  };
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center">
      <img
        src={new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.png', import.meta.url).href}
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
      />
      <div className="absolute inset-0 bg-[var(--vestara-surface-shell-canvas)]/65 backdrop-blur-[20px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--vestara-surface-shell-canvas)]/20 via-transparent to-[var(--vestara-surface-shell-canvas)]/60" />
      <div className="relative z-10 w-[960px] max-w-[92vw] h-[560px] max-h-[88vh] rounded-[var(--vestara-radius-3xl)] bg-[var(--vestara-surface-shell-panel)]/85 border border-[var(--vestara-border-shell)] shadow-[var(--vestara-elevation-shell-float)] overflow-hidden grid grid-cols-1 md:grid-cols-[45%_55%] backdrop-blur-xl">
        <div className="relative p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[var(--vestara-border-shell)]/60 bg-[var(--vestara-surface-shell-panel)]/40">
          <div>
            <div className="flex items-center gap-3">
              <VestaraLogoTeal size={44} glow />
              <div>
                <div className="text-[length:var(--vestara-font-size-code)] font-bold tracking-[0.08em] text-[var(--vestara-text-shell-bright)]">
                  VESTARA
                </div>
                <div className="text-[length:var(--vestara-font-size-micro)] tracking-[0.22em] text-[var(--vestara-text-shell-muted)] -mt-0.5">
                  SHELL OS
                </div>
              </div>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--vestara-status-shell-success)] animate-pulse" />
            </div>
            <div className="mt-8">
              <div className="text-[length:var(--vestara-font-size-title-large)] leading-[1.1] text-[var(--vestara-text-shell-bright)] font-[family-name:var(--vestara-font-family-display)]">
                First-class
                <br />
                Desktop Shell
              </div>
              <div className="mt-3 text-[length:var(--vestara-font-size-label)] leading-5 text-[var(--vestara-text-shell-secondary)] max-w-[220px]">
                Draggable Workspace
                <br />
                Wired Packages
                <br />
                Teal V identity system
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-3">
              {LOGIN_PREVIEW_CARDS.map((c) => {
                const Icon = PREVIEW_ICONS[c.icon];
                return (
                  <div
                    key={c.title}
                    className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)]/70 border border-[var(--vestara-border-shell)]/60 p-3 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] flex items-center justify-center">
                      <Icon size={14} className="text-[var(--vestara-text-shell-muted)]" />
                    </div>
                    <div>
                      <div className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
                        {c.title}
                      </div>
                      <div className="text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-muted)]">
                        {c.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-faint)] mt-6">
            v7.15.112 FINAL • teal identity • 32px header • drag shell
          </div>
        </div>

        <div className="p-8 flex flex-col justify-center">
          <div className="mb-6">
            <div className="text-[length:var(--vestara-font-size-page-title)] font-medium text-[var(--vestara-text-shell-bright)] font-[family-name:var(--vestara-font-family-display)]">
              {title}, Director.
            </div>
            <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)] mt-1">
              {mode === 'locked'
                ? 'Enter password to unlock'
                : mode === 'switch'
                  ? 'Select user to switch'
                  : 'Secure login to Vestara Desktop'}{' '}
              • vestara-platform
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-2.5 rounded-[var(--vestara-radius-xl)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)]">
              <div className="w-9 h-9 rounded-full bg-[var(--vestara-accent-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-body-small)] font-bold text-[var(--vestara-surface-shell-canvas)]">
                {SHELL_USER.initial}
              </div>
              <div>
                <div className="text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] font-medium">
                  {SHELL_USER.name}
                </div>
                <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                  {SHELL_USER.statusLong}
                </div>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-[var(--vestara-status-shell-success)] animate-pulse" />
            </div>
            <div>
              <label
                htmlFor="vestara-shell-username"
                className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] font-mono"
              >
                USERNAME
              </label>
              <input
                id="vestara-shell-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                autoComplete="username"
                placeholder="eddie"
                className="mt-1.5 w-full h-10 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] px-3 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] placeholder:text-[var(--vestara-text-shell-faint)] outline-none focus:border-[var(--vestara-accent-shell)]/40"
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              />
            </div>
            <div>
              <label
                htmlFor="vestara-shell-password"
                className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] font-mono"
              >
                PASSWORD
              </label>
              <input
                id="vestara-shell-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="mt-1.5 w-full h-10 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] px-3 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] placeholder:text-[var(--vestara-text-shell-faint)] outline-none focus:border-[var(--vestara-accent-shell)]/40"
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              />
            </div>
            <button
              type="button"
              onClick={handleContinue}
              disabled={signingIn}
              className="w-full h-11 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-accent-shell)] text-[var(--vestara-surface-shell-canvas)] text-[length:var(--vestara-font-size-body-small)] font-bold tracking-wide hover:brightness-105 transition disabled:opacity-60"
            >
              {signingIn ? 'Signing in…' : 'Continue → Desktop'}
            </button>
            {authNote && (
              <div
                role="status"
                className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-status-shell-warning)]"
              >
                {authNote}
              </div>
            )}
            <div className="flex justify-between text-[length:var(--vestara-font-size-caption)] font-mono">
              <button
                type="button"
                className="text-[var(--vestara-text-shell-muted)] hover:text-[var(--vestara-text-shell-secondary)]"
              >
                Biometric • Touch ID
              </button>
              <button
                type="button"
                className="text-[var(--vestara-text-shell-muted)] hover:text-[var(--vestara-text-shell-secondary)]"
              >
                Skip to Desktop
              </button>
            </div>
            <div className="pt-4 border-t border-[var(--vestara-border-shell)]/50 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-faint)] flex justify-between">
              <span>{LOGIN_FOOTER.left}</span>
              <span>{LOGIN_FOOTER.right}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
