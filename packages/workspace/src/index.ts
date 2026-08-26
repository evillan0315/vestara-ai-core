/**
 * @vestara/workspace — Workspace Runtime
 *
 * The canonical pipeline for opening a repository and establishing a
 * persistent, repository-aware workspace. Every future consumer (CLI,
 * REST API, desktop Workspace, IDE extension, Vestara OS) imports this
 * package and calls WorkspaceRuntime.open() — they never import knowledge,
 * memory, or reasoning directly.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Blueprint: Book 3 — AI Architecture
 *   Foundation: RepositoryWorkspace, VOM
 *   Runtime: Kernel Lifecycle
 */

export type {
  AcceptanceBoundary,
  AcceptanceDeclaration,
  AcceptanceObligation,
} from './acceptance-boundary';
export {
  parseAcceptanceDeclaration,
  refineAcceptanceBoundary,
  renderAcceptanceBoundary,
  seedAcceptanceBoundary,
} from './acceptance-boundary';
export { AccuracyStorage } from './accuracy-storage';
export type {
  AgentCapabilityDefinition,
  AgentCapabilityInput,
  AgentCapabilityName,
  AgentCapabilityResult,
  AgentFilesystemCapability,
} from './agent-capability';
export { AgentCapabilityManager, capabilityDefinitions } from './agent-capability-manager';
export { AgentCoordinator } from './agent-coordinator';
export { AGENT_MANIFEST, AGENT_MIGRATIONS, PLANS_MANIFEST } from './agent-migrations';
export { AgentPermissionEngine } from './agent-permission';
export { AgentRuntime } from './agent-runtime';
export { AgentService } from './agent-service';
export { AgentStorage } from './agent-storage';
export type { WorkflowInstance, WorkflowStepDef, WorkflowStepResult } from './agent-workflow-service';
export { AgentWorkflowService } from './agent-workflow-service';
export { CANONICAL_AGENTS } from './agents.registry';
export { AnalyticsService } from './analytics-service';
export type { AuditEntry } from './audit-store';
export { AuditStore } from './audit-store';
export { AutoIndex } from './auto-index';
export { CapabilityService } from './capability-service';
export { createFilesystemCapabilityTools } from './capability-tool-provider';
export { ChangeSetStorage } from './change-set-storage';
export { CloudService } from './cloud-service';
export { CloudStorage } from './cloud-storage';
export { CollaborationService } from './collaboration-service';
export { CollaborationStorage } from './collaboration-storage';
export { DecisionService } from './decision-service';
export { DecisionStorage } from './decision-storage';
export { DesktopService } from './desktop-service';
export {
  type BehaviorReport,
  type ComparisonDimension,
  compareBehavior,
  type DualPathComparison,
  diffChangedFiles,
  type EngineId,
  type TerminalStatus,
  terminalEquivalent,
  UsageTracker,
  type Verdict,
} from './dual-path';
export { EngineeringMemory } from './engineering-memory';
export { EnterpriseService } from './enterprise-service';
export { EnterpriseStorage } from './enterprise-storage';
export { AiProjectPlanner } from './ev001/ai-project-planner';
export { HardcodedProjectPlanner } from './ev001/hardcoded-planner';
export type { ContextContribution, ContextSource } from './ev001/planning-context';
export { ContextAssembler, MemoryContextSource } from './ev001/planning-context';
export type { CreateProjectResult } from './ev001/project-orchestrator';
export { ProjectOrchestrator } from './ev001/project-orchestrator';
export type { PlanningContext, ProjectPlan, ProjectPlanner, ProjectStep } from './ev001/project-planner';
export type { WorkflowProgress } from './ev001/project-workflow';
export { ProjectWorkflow } from './ev001/project-workflow';
export { RepositoryContextSource } from './ev001/repository-context-source';
export { ExecutionEngine } from './execution-engine';
export { ExecutionPlanner } from './execution-planner';
export { ExplainService } from './explain-service';
export type {
  CopyResult,
  DirectoryEntry,
  FileInfo,
  GrepResult,
  HashResult,
  ReadResult,
  TreeEntry,
  WriteResult,
} from './fs-service';
export { FilesystemService } from './fs-service';
export type {
  GitBlameEntry,
  GitCommit,
  GitDiffEntry,
  GitDiffHunk,
  GitLogOptions,
  GitStatus,
  GitStatusEntry,
} from './git-service';
export { GitService } from './git-service';
export {
  type AgentExecutionRequest,
  type AgentExecutionResult,
  HarnessExecutionAdapter,
  type HarnessRunRecord,
  HarnessSession,
  type HarnessSessionOptions,
} from './harness-session';
export {
  createDefaultAssignmentResolver,
  HarnessTaskDispatcher,
  type HarnessTaskDispatcherOptions,
  type HarnessThreadRunner,
} from './harness-task-dispatcher';
export { HelpService } from './help-service';
export { ImpactStorage } from './impact-storage';
export { ImplementationService } from './implementation-service';
export { KnowledgeGraphStorage } from './knowledge-graph-storage';
export { MemoryService } from './memory-service';
export type { Milestone, MilestoneStatus } from './milestone-service';
export { MilestoneService } from './milestone-service';
export { MonitorService } from './monitor-service';
export {
  type ChangeProjectorLike,
  MULTI_AGENT_WORKFLOW_TEMPLATES,
  type MultiAgentStageRecord,
  type MultiAgentStageSpec,
  type MultiAgentWorkflowOptions,
  MultiAgentWorkflowOrchestrator,
  type MultiAgentWorkflowStart,
  type MultiAgentWorkflowStartInput,
  type MultiAgentWorkflowTemplate,
  type MultiAgentWorkflowTemplateId,
} from './multi-agent-workflow';
export { OrderService } from './order-service';
export { OrderStorage } from './order-storage';
export type {
  Address,
  Order,
  OrderItem,
  OrderPriority,
  OrderStatus,
  PaymentStatus,
} from './order-types';
export { OrganizationService } from './organization-service';
export { OrganizationStorage } from './organization-storage';
export { OSSystemService } from './os-service';
export type { PathValidation } from './path-security';
// ─── Workspace Runtime Service (NEW) ──────────────────────────
export { PathSecurity } from './path-security';
export { PlanStorage } from './plan-storage';
export { PlanningService } from './planning-service';
export { PluginRegistry } from './plugin-registry';
export { PluginRuntime } from './plugin-runtime';
export { PredictionService } from './prediction-service';
export { PreferenceService } from './preference-service';
export {
  ActivityProducer,
  ArchitectureProducer,
  createDefaultProducers,
  FrameworkProducer,
  HealthProducer,
  LanguageProducer,
  MaturityProducer,
  RiskProducer,
} from './producers/index';
export type {
  DetectedFramework,
  DetectedInfrastructure,
  DetectedLanguage,
  DetectedPackageManager,
  DetectedTooling,
  ProjectIdentity,
  ProjectProfile,
} from './project-profile';
export { ProjectProfileService } from './project-profile';
export { ProjectService } from './project-service';
export { ProjectStorage } from './project-storage';
export type {
  Project,
  ProjectStatus,
  ProjectTask,
  ProjectTaskPriority,
  ProjectTaskStatus,
  Sprint,
  SprintStatus,
} from './project-types';
export { createFingerprint } from './repository-fingerprint';
export { RepositoryIntelligence } from './repository-intelligence';
export { RepositoryPresenter } from './repository-presenter';
export type { DependencyResolverConfig } from './runtime/dependency-resolver';
// Runtime composition primitives
export { DependencyResolver, MissingDependencyError, RuntimeDependencyCycleError } from './runtime/dependency-resolver';
export type { AggregatedHealth } from './runtime/health-aggregator';
export { HealthAggregator } from './runtime/health-aggregator';
export type { ProductEvent, ProductEventType } from './runtime/product-events';
export { ProductEventTranslator } from './runtime/product-events';
export type { RuntimeGroupEntry } from './runtime/runtime-group';
export { DuplicateRuntimeError, RuntimeGroup } from './runtime/runtime-group';
export type { RuntimeRegistration, WorkspaceDefinition } from './runtime/workspace-definition';
export { WorkspaceFactory } from './runtime/workspace-factory';
export { WorkspaceComposition } from './runtime/workspace-runtime';
export type {
  WorkspaceRuntimeClient,
  WorkspaceRuntimeClientOptions,
  WorkspaceRuntimeClientStatus,
} from './runtime-client';
export { HttpWorkspaceRuntimeClient } from './runtime-client';
export type { HealthCheckResult, ServiceContract, ServiceStatus } from './service-contract';
export {
  AgentDaemonService,
  CloudControllerService,
  KernelService,
  PluginRuntimeService,
  WorkspaceManagerService,
} from './services';
export { SessionOrchestrator, WORKFLOWS } from './session-orchestrator';
export { SessionService } from './session-service';
export { SessionStorage } from './session-storage';
export { SuggestionService } from './suggestion-service';
export { SuggestionStorage } from './suggestion-storage';
export type { SystemState } from './system-state';
export { collectSystemState, renderSystemState } from './system-state';
export type {
  AgentCapability,
  AgentDefinition,
  AgentExecution,
  AgentExecutionStatus,
  AgentPermission,
  AgentRole,
  AgentTeam,
  AgentType,
  AgentWorkflow,
  Approval,
  ChangeSet,
  ChangeSetStatus,
  CollaborationComment,
  CollaborationRecord,
  DependencyEdge,
  DependencyGraph,
  DetectedRisk,
  DiscoveryResult,
  EngineeringSession,
  EntryPoint,
  FileChange,
  FileChangeStatus,
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeRelation,
  KnowledgeRelationType,
  Layer,
  LayerAssignment,
  OpenResult,
  Ownership,
  PackageNode,
  Plan,
  PlanStatus,
  PresentedSummary,
  RepositoryFingerprint,
  RepositoryProfile,
  RepositoryWorkspace,
  ReviewStatus,
  RiskCategory,
  SessionParticipant,
  SessionStatus,
  Task,
  TaskStatus,
  VerificationCheck,
  VerificationReport,
  VerificationStatus,
  VerificationType,
  WorkerConfig,
  WorkerEvent,
  WorkerType,
  WorkflowStep,
  WorkspaceEvent,
  WorkspaceStatus,
} from './types';
export { DefaultUnderstandingAssembler } from './understanding-assembler';
export { UnderstandingContextAssembler } from './understanding-context-assembler';
export { DefaultUnderstandingEngine } from './understanding-engine';
export type { User } from './user-store';
export { UserStore } from './user-store';
export type { TelemetryCallback, TelemetryCheckResult } from './verification-service';
export { VerificationService } from './verification-service';
export { VerificationStorage } from './verification-storage';
export { WorkflowService } from './workflow-service';
export { WorkspaceAnalyst } from './workspace-analyst';
export type { WorkspaceContext } from './workspace-context-provider';
export { WorkspaceContextProvider } from './workspace-context-provider';
export type { IndexEntry, IndexNode, IndexOptions } from './workspace-index';
export { WorkspaceIndex } from './workspace-index';
export type { ModelConfig, ProviderConfig, WorkspaceManifestData } from './workspace-manifest';
export { WorkspaceManifest } from './workspace-manifest';
export { WORKSPACE_DOMAIN_MANIFEST, WORKSPACE_DOMAIN_MIGRATIONS } from './workspace-migrations';
export { WorkspacePersistence } from './workspace-persistence';
export { WorkspaceRuntime } from './workspace-runtime';
export type { WorkspaceRuntimeServiceConfig, WorkspaceRuntimeServiceHealth } from './workspace-runtime-service';
export { WorkspaceRuntimeService } from './workspace-runtime-service';
export { WorkspaceSession } from './workspace-session';
export { WorkspaceToolProvider } from './workspace-tool-provider';
export type { WorkspaceUiWatchEvent } from './workspace-ui-watcher';
export { WorkspaceUiWatcher } from './workspace-ui-watcher';
export type { WatchCallback, WatchEvent, WatchEventType } from './workspace-watcher';
export { WorkspaceWatcher } from './workspace-watcher';
