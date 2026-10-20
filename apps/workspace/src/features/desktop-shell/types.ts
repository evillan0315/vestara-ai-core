/**
 * VES-UI-001 T0: Desktop Shell Types
 *
 * Window-manager view model promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/lib/types.ts`).
 * Pure types — no runtime values, no palette literals. Visual roles are
 * bound in `tokens.ts` / `desktop-shell.tokens.css`, never here.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (Phase 0 scaffold)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §2–§3
 */

export type Phase = 'boot' | 'login' | 'desktop' | 'shutdown';

export type LoginMode = 'default' | 'locked' | 'switch';

export type WinType =
  | 'workspace'
  | 'terminal'
  | 'marketplace'
  | 'files'
  | 'overview'
  | 'settings'
  | 'agent'
  | 'diagnostic'
  | 'activity';

export interface WinData {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly z: number;
  readonly minimized: boolean;
  readonly maximized: boolean;
  readonly prev?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly type: WinType;
}

export interface PackageDef {
  readonly id: WinType;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly defaultSize: { readonly w: number; readonly h: number };
}
