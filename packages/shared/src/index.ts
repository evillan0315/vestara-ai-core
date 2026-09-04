/**
 * @vestara/shared — Core types and interfaces for the Vestara Runtime.
 */

export * from './assistant-execution.js';
// Explicit value re-exports (GA-UX-PREMIUM M3): the CJS barrel compiles to
// `__exportStar`, whose names are invisible to static CJS→ESM interop (Vite
// dev /@fs serving of linked workspace dists). Named re-exports keep the
// contract values importable from Node consumers. The browser imports this
// package TYPE-ONLY (erased at build), so no /@fs runtime resolution is
// required on the client.
export {
  ASSISTANT_EXECUTION_BOUNDS,
  ASSISTANT_EXECUTION_CONTRACT,
  ASSISTANT_EXECUTION_VERSION,
  isAssistantExecutionDetail,
  normalizeAssistantExecutionDetail,
} from './assistant-execution.js';
export * from './audio.js';
export * from './config.js';
export * from './conversation-types.js';
export * from './events.js';
export * from './kernel.js';
export * from './lifecycle.js';
export * from './logging.js';
export * from './metrics.js';
export * from './onboarding.js';
export * from './provider.js';
export * from './registry.js';
export * from './router.js';
export { dbAll, dbGet, dbRun, getSql } from './sql.js';
export * from './stream.js';
export * from './theme-builder-schemas.js';
export * from './tool.js';
