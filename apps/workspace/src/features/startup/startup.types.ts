/**
 * VOS-STARTUP-001 P1: Startup Screen Types
 *
 * Fixture-first view model for the OS startup route
 * (/startup?entry=onboarding|login). Mirrors the reference fidelity
 * contract in docs/VOS-STARTUP-SCREEN-PLAN.md.
 */

export type StartupEntry = 'onboarding' | 'login';

export type StartupState = 'loading' | 'ready' | 'ready-celebration' | 'degraded';

export type ChecklistStatus = 'complete' | 'pending' | 'failed';

export interface StartupChecklistRow {
  readonly id: string;
  readonly label: string;
  readonly status: ChecklistStatus;
}

export interface StartupViewModel {
  readonly entry: StartupEntry;
  readonly state: StartupState;
  readonly headline: string;
  readonly subline: string;
  readonly checklist: readonly StartupChecklistRow[];
  readonly quote: string;
  readonly quoteBy: string;
  readonly diagnosticsCode: string | null;
  readonly recoveryAction: string | null;
}
