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

export { AccuracyStorage } from './accuracy-storage';
export { AgentCoordinator } from './agent-coordinator';
export { AgentPermissionEngine } from './agent-permission';
export { AgentRuntime } from './agent-runtime';
export { AgentService } from './agent-service';
export { AgentStorage } from './agent-storage';
export type { WorkflowInstance, WorkflowStepDef, WorkflowStepResult } from './agent-workflow-service';
export { AgentWorkflowService } from './agent-workflow-service';
export { AnalyticsService } from './analytics-service';
export { AutoIndex } from './auto-index';
export { CapabilityService } from './capability-service';
export { ChangeSetStorage } from './change-set-storage';
export { CloudService } from './cloud-service';
export { CloudStorage } from './cloud-storage';
export { CollaborationService } from './collaboration-service';
export { CollaborationStorage } from './collaboration-storage';
export { DecisionService } from './decision-service';
export { DecisionStorage } from './decision-storage';
export { DesktopService } from './desktop-service';
export { EngineeringMemory } from './engineering-memory';
export { EnterpriseService } from './enterprise-service';
export { EnterpriseStorage } from './enterprise-storage';
export { ExecutionEngine } from './execution-engine';
export { ExecutionPlanner } from './execution-planner';
export { ExplainService } from './explain-service';
export { HelpService } from './help-service';
export { ImpactStorage } from './impact-storage';
export { ImplementationService } from './implementation-service';
export { KnowledgeGraphStorage } from './knowledge-graph-storage';
export { MemoryService } from './memory-service';
export type { Milestone, MilestoneStatus } from './milestone-service';
export { MilestoneService } from './milestone-service';
export { MonitorService } from './monitor-service';
export { OrganizationService } from './organization-service';
export { OrganizationStorage } from './organization-storage';
export { OSSystemService } from './os-service';
export { PlanStorage } from './plan-storage';
export { PlanningService } from './planning-service';
export { PluginRegistry } from './plugin-registry';
export { PluginRuntime } from './plugin-runtime';
export { PredictionService } from './prediction-service';
export { PreferenceService } from './preference-service';
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
export type { RuntimeGroupEntry } from './runtime/runtime-group';
export { DuplicateRuntimeError, RuntimeGroup } from './runtime/runtime-group';
export type { RuntimeRegistration, WorkspaceDefinition } from './runtime/workspace-definition';
export { WorkspaceFactory } from './runtime/workspace-factory';
export { WorkspaceComposition } from './runtime/workspace-runtime';
export { ProductEventTranslator } from './runtime/product-events';
export type { ProductEvent, ProductEventType } from './runtime/product-events';
export { ProjectOrchestrator } from './ev001/project-orchestrator';
export type { ProjectPlanner, ProjectPlan, ProjectStep } from './ev001/project-planner';
export { HardcodedProjectPlanner } from './ev001/hardcoded-planner';
export { AiProjectPlanner } from './ev001/ai-project-planner';
export { ProjectWorkflow } from './ev001/project-workflow';
export type { WorkflowProgress } from './ev001/project-workflow';
export type { CreateProjectResult } from './ev001/project-orchestrator';
export { MemoryContextService } from './ev001/planning-context';
export type { PlanningContext } from './ev001/planning-context';
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
export { VerificationService } from './verification-service';
export { VerificationStorage } from './verification-storage';
export { WorkflowService } from './workflow-service';
export { DefaultUnderstandingEngine } from './understanding-engine';
export { DefaultUnderstandingAssembler } from './understanding-assembler';
export { UnderstandingContextAssembler } from './understanding-context-assembler';
export {
  createDefaultProducers,
  LanguageProducer,
  FrameworkProducer,
  ArchitectureProducer,
  MaturityProducer,
  RiskProducer,
  HealthProducer,
  ActivityProducer,
} from './producers/index';
export { WorkspaceAnalyst } from './workspace-analyst';
export { WorkspaceManifest } from './workspace-manifest';
export { WorkspacePersistence } from './workspace-persistence';
export { WorkspaceRuntime } from './workspace-runtime';
export { WorkspaceSession } from './workspace-session';
export type { WorkspaceUiWatchEvent } from './workspace-ui-watcher';
export { WorkspaceUiWatcher } from './workspace-ui-watcher';
