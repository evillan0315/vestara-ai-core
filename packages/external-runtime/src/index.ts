/**
 * @vestara/external-runtime
 *
 * External coding-agent runtime observability. Generic adapter protocol,
 * registry, centralized redaction, and correlation primitives shared by the
 * OpenCode (primary), Claude Code, and OpenAI Codex (secondary) adapters.
 *
 * The core never imports adapter-specific implementation details; adapters
 * implement the generic protocol and are registered by the wiring layer.
 */

export type { ExternalAgentRuntimeAdapter, ExternalRuntimeIntelligenceAdapter } from './adapter';
export * from './adapters/index.js';
export {
  buildCorrelation,
  isConfirmed,
  mergeCorrelations,
  methodConfidence,
} from './correlation';
export {
  isSensitiveKey,
  redact,
  redactCredential,
  redactEnvironment,
  redactValue,
  wasRedacted,
} from './redact';
export type { RegistryObserver } from './registry';
export { ExternalRuntimeRegistry } from './registry';
export type * from './types';
export { ExternalAdapterError } from './types';
