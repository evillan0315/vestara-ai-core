/**
 * AgentCapability — the executable capability boundary between agents and
 * the Filesystem Runtime.
 *
 * Agents never touch the filesystem directly. They request a named capability;
 * the AgentCapabilityManager resolves it against the agent's permissions and
 * executes it through the FilesystemRuntime, which enforces the workspace
 * sandbox, approval gates, and operation logging.
 *
 * Architecture Traceability:
 *   PCS: PCS-007 — Agent Runtime
 *   Safety: LLM reasons, agents request capabilities, runtimes execute controlled operations.
 */

import type { FsObservation, FsPatch } from '@vestara/filesystem-runtime';

export type AgentCapabilityName =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'filesystem.update'
  | 'filesystem.delete'
  | 'filesystem.create'
  | 'filesystem.rename'
  | 'filesystem.copy'
  | 'filesystem.list'
  | 'filesystem.stat'
  | 'filesystem.exists'
  | 'filesystem.search'
  | 'filesystem.references';

export interface AgentCapabilityInput {
  path?: string;
  content?: string;
  patch?: FsPatch;
  pattern?: string;
  query?: string;
  search?: string;
  dir?: string;
  source?: string;
  destination?: string;
  oldPath?: string;
  newPath?: string;
  dryRun?: boolean;
  reason?: string;
  approvalId?: string;
  [key: string]: unknown;
}

export interface AgentCapabilityResult {
  ok: boolean;
  observation?: FsObservation;
  data?: unknown;
  error?: string;
  approvalId?: string;
}

export interface AgentCapabilityDefinition {
  name: AgentCapabilityName;
  description: string;
  /** Danger level used for risk classification and approval gating. */
  risk: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  /** Mutations always need a reason so history is auditable. */
  requiresReason: boolean;
}

export interface AgentFilesystemCapability {
  name: AgentCapabilityName;
  execute(input: AgentCapabilityInput): Promise<AgentCapabilityResult>;
}
