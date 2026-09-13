/**
 * @vestara/terminal-runtime — public surface.
 *
 * Governed interactive shell sessions for GA-TERM-001 Phase 3:
 * session-scoped `bash` processes under the workspace root, streamed over
 * `/ws/terminal`, with idle/lifetime bounds and redacted transcripts.
 */

export type { TerminalDriverKind, TerminalProcess, TerminalProcessEvents, TerminalSpawnOptions } from './driver';
export {
  buildSessionEnv,
  createTerminalProcess,
  resolveTerminalDriverKind,
  spawnPtyTerminalProcess,
  spawnTerminalProcess,
} from './driver';
export { redactSecrets } from './redact';
export type {
  TerminalKillReason,
  TerminalOutputListener,
  TerminalRegistryEvent,
  TerminalRegistryOptions,
  TerminalSessionInfo,
  TerminalSessionState,
} from './registry';
export { resolveSessionCwd, TerminalSessionRegistry } from './registry';
export type { TerminalStreamState } from './stream';
export { createTerminalStreamState, flushTerminalStream, processTerminalChunk } from './stream';
