/**
 * External coding-agent runtime adapter contract.
 *
 * The generic protocol implemented by OpenCode (primary), Claude Code, and
 * OpenAI Codex (secondary) adapters. Control methods are optional and
 * capability-gated; the registry and UI must never assume every runtime
 * supports the same operations.
 */

import type {
  AdapterCapabilityStatus,
  ExternalAgentDefinition,
  ExternalCommandDefinition,
  ExternalInstructionSource,
  ExternalLaunchedSession,
  ExternalMcpServer,
  ExternalModelDefinition,
  ExternalPluginDefinition,
  ExternalProvider,
  ExternalRuntimeCapability,
  ExternalRuntimeConfigurationSnapshot,
  ExternalRuntimeConnection,
  ExternalRuntimeDetectionContext,
  ExternalRuntimeDetectionResult,
  ExternalRuntimeEventObserver,
  ExternalRuntimeHealth,
  ExternalRuntimeInstance,
  ExternalRuntimeSubscription,
  ExternalRuntimeTarget,
  ExternalRuntimeType,
  ExternalSessionDetails,
  ExternalSessionLaunchRequest,
  ExternalSessionQuery,
  ExternalSessionRuntimeSnapshot,
  ExternalSessionSummary,
  ExternalSkillDefinition,
} from './types';

export interface ExternalAgentRuntimeAdapter {
  readonly runtimeType: ExternalRuntimeType;
  readonly capabilities: readonly ExternalRuntimeCapability[];

  /** Capability availability for a specific runtime instance. */
  capabilityStatus(runtimeInstance: ExternalRuntimeInstance): readonly AdapterCapabilityStatus[];

  detect(context: ExternalRuntimeDetectionContext): Promise<ExternalRuntimeDetectionResult>;

  connect(target: ExternalRuntimeTarget): Promise<ExternalRuntimeConnection>;

  disconnect(connectionId: string): Promise<void>;

  getHealth(connectionId: string): Promise<ExternalRuntimeHealth>;

  getRuntimeSnapshot(connectionId: string): Promise<ExternalRuntimeInstance>;

  listSessions(connectionId: string, query?: ExternalSessionQuery): Promise<readonly ExternalSessionSummary[]>;

  getSession(connectionId: string, sessionId: string): Promise<ExternalSessionDetails>;

  getConfiguration(connectionId: string): Promise<ExternalRuntimeConfigurationSnapshot>;

  subscribe(connectionId: string, observer: ExternalRuntimeEventObserver): Promise<ExternalRuntimeSubscription>;

  launchSession?(connectionId: string, request: ExternalSessionLaunchRequest): Promise<ExternalLaunchedSession>;

  abortSession?(connectionId: string, sessionId: string): Promise<void>;
}

/** Optional runtime-intelligence surface (OpenCode primary adapter). */
export interface ExternalRuntimeIntelligenceAdapter {
  readonly supportsIntelligence: true;

  listAgents(connectionId: string): Promise<readonly ExternalAgentDefinition[]>;

  listSkills(connectionId: string): Promise<readonly ExternalSkillDefinition[]>;

  listInstructions(connectionId: string): Promise<readonly ExternalInstructionSource[]>;

  listCommands(connectionId: string): Promise<readonly ExternalCommandDefinition[]>;

  listPlugins(connectionId: string): Promise<readonly ExternalPluginDefinition[]>;

  listMcpServers(connectionId: string): Promise<readonly ExternalMcpServer[]>;

  listProviders(connectionId: string): Promise<readonly ExternalProvider[]>;

  listModels(connectionId: string): Promise<readonly ExternalModelDefinition[]>;

  getSessionRuntimeSnapshot(connectionId: string, sessionId: string): Promise<ExternalSessionRuntimeSnapshot | null>;
}
