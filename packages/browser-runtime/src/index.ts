/**
 * @vestara/browser-runtime — Kernel-level browser runtime service
 *
 * Manages browser session lifecycle, emits normalized events to the
 * EventBus, and provides managed access to browser capabilities for
 * the Agent Harness and Browser Agent.
 */

export {
  BROWSER_ACTION_COMPLETED,
  BROWSER_ACTION_FAILED,
  BROWSER_ACTION_STARTED,
  BROWSER_NAVIGATION_COMPLETED,
  BROWSER_NAVIGATION_STARTED,
  BROWSER_OBSERVATION_CREATED,
  BROWSER_PERMISSION_REQUESTED,
  BROWSER_SESSION_CREATED,
  BROWSER_SESSION_ERROR,
  BROWSER_SESSION_READY,
  BROWSER_SESSION_STOPPED,
  BROWSER_TASK_COMPLETED,
  BROWSER_TASK_FAILED,
  type BrowserPermissionLevel,
  type BrowserPermissionRule,
  DEFAULT_BROWSER_PERMISSIONS,
  evaluateBrowserPermission,
} from './browser-events';
export {
  type BrowserEvidenceCollectionRequest,
  BrowserEvidenceCollector,
  type BrowserEvidenceItem,
} from './browser-evidence';
export {
  BrowserRuntimeService,
  type BrowserRuntimeServiceOptions,
  type BrowserRuntimeStats,
  type ManagedBrowserSession,
} from './browser-runtime';
