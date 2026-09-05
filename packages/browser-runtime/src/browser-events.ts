/**
 * @vestara/browser-runtime — Browser Event Types (LB-008)
 *
 * Normalized event types published by the Browser Runtime to the EventBus.
 * All events follow the pattern `browser.<domain>.<verb>`.
 */

// ─── Session events ─────────────────────────────────────────

/** A new browser session has been created. */
export const BROWSER_SESSION_CREATED = 'browser.session.created' as const;

/** A browser session has been marked ready for use. */
export const BROWSER_SESSION_READY = 'browser.session.ready' as const;

/** A browser session has been stopped. */
export const BROWSER_SESSION_STOPPED = 'browser.session.stopped' as const;

/** A browser session has encountered an error. */
export const BROWSER_SESSION_ERROR = 'browser.session.error' as const;

// ─── Navigation events ──────────────────────────────────────

/** Navigation to a URL has started. */
export const BROWSER_NAVIGATION_STARTED = 'browser.navigation.started' as const;

/** Navigation to a URL has completed. */
export const BROWSER_NAVIGATION_COMPLETED = 'browser.navigation.completed' as const;

// ─── Observation events ─────────────────────────────────────

/** A page observation has been created. */
export const BROWSER_OBSERVATION_CREATED = 'browser.observation.created' as const;

// ─── Viewport events (live streaming) ───────────────────────

/** A fresh viewport capture is available (image data URL). */
export const BROWSER_VIEWPORT_CAPTURED = 'browser.viewport.captured' as const;

// ─── Action events ──────────────────────────────────────────

/** A browser action has started (click, type, scroll, etc.). */
export const BROWSER_ACTION_STARTED = 'browser.action.started' as const;

/** A browser action has completed successfully. */
export const BROWSER_ACTION_COMPLETED = 'browser.action.completed' as const;

/** A browser action has failed. */
export const BROWSER_ACTION_FAILED = 'browser.action.failed' as const;

// ─── Task events ────────────────────────────────────────────

/** A browser task has started executing. */
export const BROWSER_TASK_STARTED = 'browser.task.started' as const;

/** A browser task step has started. */
export const BROWSER_STEP_STARTED = 'browser.step.started' as const;

/** A browser task step has completed. */
export const BROWSER_STEP_COMPLETED = 'browser.step.completed' as const;

/** A browser task step has failed. */
export const BROWSER_STEP_FAILED = 'browser.step.failed' as const;

/** A browser task has completed. */
export const BROWSER_TASK_COMPLETED = 'browser.task.completed' as const;

/** A browser task has failed. */
export const BROWSER_TASK_FAILED = 'browser.task.failed' as const;

// ─── Control events (human takeover) ────────────────────────

/** A human has taken control of the browser session. */
export const BROWSER_CONTROL_TAKEN = 'browser.control.taken' as const;

/** Control has been returned to the agent. */
export const BROWSER_CONTROL_RETURNED = 'browser.control.returned' as const;

// ─── Permission events ──────────────────────────────────────

/** A browser action requires permission approval. */
export const BROWSER_PERMISSION_REQUESTED = 'browser.permission.requested' as const;

/** A pending browser permission request has been granted. */
export const BROWSER_PERMISSION_GRANTED = 'browser.permission.granted' as const;

/** A pending browser permission request has been denied. */
export const BROWSER_PERMISSION_DENIED = 'browser.permission.denied' as const;

// ─── Control mode ───────────────────────────────────────────

/** Who currently controls the browser session. */
export type BrowserControlMode = 'agent' | 'human';

// ─── Permission policy types ────────────────────────────────

export type BrowserPermissionLevel = 'allow' | 'ask' | 'deny';

export interface BrowserPermissionRule {
  readonly action: string;
  readonly level: BrowserPermissionLevel;
  readonly reason?: string;
}

/**
 * Default permission rules for browser actions.
 * Safe operations are allowed; sensitive operations require approval.
 */
export const DEFAULT_BROWSER_PERMISSIONS: readonly BrowserPermissionRule[] = [
  { action: 'browser.navigate', level: 'allow', reason: 'Navigation within allowed origins' },
  { action: 'browser.observe', level: 'allow', reason: 'Read-only page observation' },
  { action: 'browser.snapshot', level: 'allow', reason: 'Read-only page text extraction' },
  { action: 'browser.screenshot', level: 'allow', reason: 'Visual evidence capture' },
  { action: 'browser.scroll', level: 'allow', reason: 'Read-only viewport change' },
  { action: 'browser.wait', level: 'allow', reason: 'Wait for page stability' },
  { action: 'browser.back', level: 'allow', reason: 'History navigation' },
  { action: 'browser.forward', level: 'allow', reason: 'History navigation' },
  { action: 'browser.reload', level: 'allow', reason: 'Page reload' },
  { action: 'browser.click', level: 'ask', reason: 'Interaction may trigger side effects' },
  { action: 'browser.type', level: 'ask', reason: 'Form input may submit data' },
  { action: 'browser.select', level: 'ask', reason: 'Selection may change state' },
];

/**
 * Evaluate whether a browser action is permitted.
 * Returns the permission level and optional reason.
 */
export function evaluateBrowserPermission(
  action: string,
  rules: readonly BrowserPermissionRule[] = DEFAULT_BROWSER_PERMISSIONS,
): BrowserPermissionRule {
  const matched = rules.find((rule) => rule.action === action);
  return matched ?? { action, level: 'ask', reason: 'Unknown action — defaulting to ask' };
}
