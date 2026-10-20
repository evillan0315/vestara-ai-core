/**
 * VES-UI-001 T4: DesktopShell — boot → login → desktop → shutdown state machine.
 *
 * Promotes the phase model from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/App.tsx`: `Phase`
 * state machine, `handleSystemAction` lockscreen / logout / switch /
 * shutdown) into the governed Workspace UI:
 * - `desktopShellReducer` is the pure, vitest-covered transition function.
 *   Out-of-phase actions are no-ops (the reducer returns the same state).
 * - `DesktopShell` owns the reducer and renders `BootScreen` / `LoginScreen`
 *   versus the desktop `children`. A `locked` login keeps the desktop
 *   mounted (hidden) so the session is preserved; every other login
 *   replaces it. Shutdown returns to `login` in `default` mode, mirroring
 *   the prototype `BootScreen shutting onDone`.
 * - `systemMenuActionToShellAction` maps `SystemMenu` ids onto reducer
 *   actions (`settings` opens a window and is not a phase — returns `null`).
 *
 * No window-manager ownership here (T3 `VestaraWindow` stack lives with the
 * desktop parent); this module owns phase only.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T4 Boot + Login + state machine)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §5
 */

import { useReducer, type ReactNode } from 'react';
import { BootScreen } from './BootScreen';
import { LoginScreen } from './LoginScreen';
import type { SystemMenuActionId } from './SystemMenu';
import type { LoginMode, Phase } from './types';
import './desktop-shell.tokens.css';

export interface DesktopShellState {
  readonly phase: Phase;
  readonly loginMode: LoginMode;
}

export const initialDesktopShellState: DesktopShellState = {
  phase: 'boot',
  loginMode: 'default',
};

export type DesktopShellAction =
  | { readonly type: 'boot-done' }
  | { readonly type: 'login-success' }
  | { readonly type: 'lock' }
  | { readonly type: 'switch-user' }
  | { readonly type: 'logout' }
  | { readonly type: 'shutdown' }
  | { readonly type: 'shutdown-done' }
  | { readonly type: 'restart' };

/**
 * Pure phase transition — `boot → login → desktop`, plus
 * `locked / switch / shutdown` overlays. Actions that do not apply to the
 * current phase return the input state unchanged.
 */
export function desktopShellReducer(
  state: DesktopShellState,
  action: DesktopShellAction,
): DesktopShellState {
  switch (action.type) {
    case 'boot-done':
      return state.phase === 'boot' ? { phase: 'login', loginMode: 'default' } : state;
    case 'login-success':
      return state.phase === 'login' ? { phase: 'desktop', loginMode: state.loginMode } : state;
    case 'lock':
      return state.phase === 'desktop' ? { phase: 'login', loginMode: 'locked' } : state;
    case 'switch-user':
      return state.phase === 'desktop' || state.phase === 'login'
        ? { phase: 'login', loginMode: 'switch' }
        : state;
    case 'logout':
      return state.phase === 'desktop' ? { phase: 'login', loginMode: 'default' } : state;
    case 'shutdown':
      return state.phase === 'desktop' || state.phase === 'login'
        ? { phase: 'shutdown', loginMode: state.loginMode }
        : state;
    case 'shutdown-done':
      return state.phase === 'shutdown' ? { phase: 'login', loginMode: 'default' } : state;
    case 'restart':
      return state.phase === 'shutdown' || state.phase === 'login'
        ? { phase: 'boot', loginMode: 'default' }
        : state;
    default:
      return state;
  }
}

/**
 * Map a `SystemMenu` selection onto a shell action. `settings` is a window
 * operation, not a phase transition, so it maps to `null` (the desktop
 * parent opens the settings window instead).
 */
export function systemMenuActionToShellAction(action: SystemMenuActionId): DesktopShellAction | null {
  switch (action) {
    case 'lockscreen':
      return { type: 'lock' };
    case 'switch':
      return { type: 'switch-user' };
    case 'logout':
      return { type: 'logout' };
    case 'shutdown':
      return { type: 'shutdown' };
    case 'settings':
      return null;
    default:
      return null;
  }
}

export interface DesktopShellProps {
  readonly children: ReactNode;
  readonly initialPhase?: Phase;
  readonly initialLoginMode?: LoginMode;
}

export function DesktopShell({
  children,
  initialPhase = 'boot',
  initialLoginMode = 'default',
}: DesktopShellProps) {
  const [state, dispatch] = useReducer(desktopShellReducer, {
    phase: initialPhase,
    loginMode: initialLoginMode,
  });

  if (state.phase === 'boot') {
    return <BootScreen onDone={() => dispatch({ type: 'boot-done' })} />;
  }

  if (state.phase === 'shutdown') {
    return <BootScreen shutting onDone={() => dispatch({ type: 'shutdown-done' })} />;
  }

  if (state.phase === 'login') {
    const login = <LoginScreen mode={state.loginMode} onLogin={() => dispatch({ type: 'login-success' })} />;
    if (state.loginMode === 'locked') {
      return (
        <>
          <div hidden data-testid="desktop-shell-session">
            {children}
          </div>
          {login}
        </>
      );
    }
    return login;
  }

  return <>{children}</>;
}
