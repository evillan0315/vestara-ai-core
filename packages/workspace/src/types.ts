/**
 * Canonical types for the Workspace Runtime.
 *
 * WorkspaceStatus is the formal lifecycle enum. Every UI observes
 * the same status values — no interface invents its own model.
 *
 * RepositoryWorkspace is the progressively enriched domain object.
 * Every pipeline stage receives it and enriches one field.
 */

// ─── Status ──────────────────────────────────────────────────

export type WorkspaceStatus =
  | 'idle'
  | 'discovering'
  | 'fingerprinting'
  | 'analyzing'
  | 'indexing'
  | 'presenting'
  | 'ready'
  | 'deferred-index'
  | 'error';

// ─── Discovery ───────────────────────────────────────────────

export interface DiscoveryResult {
  files: string[];
  totalFiles: number;
  totalSizeKB: number;
  byExtension: Record<string, number>;
  mtimeCache: Record<string, string>;
  discoveredAt: string;
}

// ─── Fingerprint ─────────────────────────────────────────────

export interface RepositoryFingerprint {
  id: string;
  name: string;
  canonicalPath: string;
  gitRoot: string | null;
  gitRemote: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  repositoryHash: string;
  fingerprintedAt: string;
}

// ─── Health Score Types ─────────────────────────────────────

export interface HealthScore {
  overall: number; // 0.0 — 10.0
  categories: {
    codeQuality: number; // large file ratio, TODO density
    testCoverage: number; // packages with tests / total
    dependencyHealth: number; // circular deps, unused deps
    documentation: number; // README, doc comments
  };
}

// ─── Analysis ────────────────────────────────────────────────

export interface EntryPoint {
  path: string;
  type: 'cli' | 'app' | 'api' | 'library' | 'worker';
  source: 'package.json' | 'convention';
  confidence: number;
}

export type RiskCategory =
  | 'large-file'
  | 'todo-hotspot'
  | 'missing-tests'
  | 'circular-dependency'
  | 'layer-violation'
  | 'low-confidence-entry';

export interface DetectedRisk {
  category: RiskCategory;
  severity: 'low' | 'medium' | 'high';
  location: string;
  detail: string;
}

export interface PackageNode {
  name: string;
  path: string;
  dependencies: string[];
  devDependencies: string[];
  isPrivate: boolean;
}

// ─── Dependency Graph ─────────────────────────────────────────

export interface DependencyEdge {
  source: string;
  target: string;
  type: 'dependency' | 'devDependency';
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
  cycles: string[][];
}

// ─── Layer Types ──────────────────────────────────────────────

export type Layer = 'contracts' | 'infrastructure' | 'services' | 'tools' | 'app' | 'ui' | 'unknown';

export interface LayerAssignment {
  packageName: string;
  layer: Layer;
  confidence: number;
}

export interface RepositoryProfile {
  name: string;
  language: string;
  framework?: string;
  packageManager?: string;
  buildTool?: string;
  testFramework?: string;
  isMonorepo: boolean;
  fileCount: number;
  totalSizeKB: number;
  packageCount: number;
  dependencyCount: number;
  entryPoints: EntryPoint[];
  risks: DetectedRisk[];
  packages: PackageNode[];
  dependencyGraph?: DependencyGraph;
  layers?: LayerAssignment[];
  healthScore?: HealthScore;
  hasDocker: boolean;
  hasCI: boolean;
  detectedAt: string;
}

// ─── Index ───────────────────────────────────────────────────

export interface IndexReport {
  documentsIndexed: number;
  chunksCreated: number;
  duration: number;
}

// ─── Presentation ────────────────────────────────────────────

export interface PresentedSummary {
  facts: {
    language: string;
    framework: string | null;
    packageManager: string | null;
    fileCount: number;
    packageCount: number;
    dependencyCount: number;
    isMonorepo: boolean;
    healthScore?: number;
    entryPoints: string[];
    entryPointDetails?: Array<{ path: string; type: string; confidence: number }>;
    risks: Array<{ category: string; severity: string; detail: string }>;
    cycles?: string[][];
    layers?: Array<{ packageName: string; layer: string }>;
  };
  narrative: {
    purpose: string;
    suggestedStartingPoints: string[];
    keyObservations: string[];
  } | null;
}

// ─── Enriched Workspace (canonical domain object) ────────────

export interface RepositoryWorkspace {
  identity: RepositoryFingerprint | null;
  discovery: DiscoveryResult | null;
  analysis: RepositoryProfile | null;
  index: IndexReport | null;
  presentation: PresentedSummary | null;
  status: WorkspaceStatus;
  error?: string;
}

// ─── Plan / Task Types ──────────────────────────────────────

export type PlanStatus = 'draft' | 'proposed' | 'approved' | 'executing' | 'completed' | 'cancelled';
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';

export interface Task {
  id: string;
  summary: string;
  description: string;
  files: string[];
  dependencies: string[];
  status: TaskStatus;
  effort: 'small' | 'medium' | 'large';
}

export interface Plan {
  id: string;
  title: string;
  goal: string;
  scope: string[];
  assumptions: string[];
  constraints: string[];
  risks: Array<{ description: string; severity: 'low' | 'medium' | 'high' }>;
  tasks: Task[];
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  workspaceId: string;
  parentExplanations: string[];
  predictionId?: string;
  decisionId?: string;
  execution?: PlanExecution;
}

export type ExecutionStrategy = 'sequential' | 'parallel' | 'hybrid';

export interface AgentAssignment {
  id: string;
  role:
    | 'architect'
    | 'planner'
    | 'developer'
    | 'reviewer'
    | 'tester'
    | 'verifier'
    | 'documentation'
    | 'security'
    | 'performance';
  taskIds: string[];
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'ready' | 'running' | 'completed';
  estimatedDuration?: number;
}

export interface PlanExecution {
  strategy: ExecutionStrategy;
  estimatedDuration: number;
  estimatedAgents: number;
  assignments: AgentAssignment[];
  approvalRequired: boolean;
}

// ─── Change Set Types ───────────────────────────────────────

export type ChangeSetStatus = 'draft' | 'ready' | 'applied' | 'partial' | 'rolled-back';
export type FileChangeStatus = 'pending' | 'applied' | 'conflict' | 'skipped';

export interface FileChange {
  path: string;
  originalContent: string;
  proposedContent: string;
  status: FileChangeStatus;
  taskId: string;
}

export interface ChangeSet {
  id: string;
  planId: string;
  title: string;
  status: ChangeSetStatus;
  files: FileChange[];
  createdAt: string;
  appliedAt: string | null;
  workspaceId: string;
  assessmentId?: string;
  decisionId?: string;
  author?: string;
  summary?: {
    filesModified: number;
    packagesModified: number;
    testsAffected: number;
    risk: 'low' | 'medium' | 'high';
    healthDelta: number;
    executionDuration: number;
  };
}

// ─── Decision Types ─────────────────────────────────────────

export interface Decision {
  id: string;
  workspaceId: string;
  planId?: string;
  assessmentId?: string;
  createdAt: string;
  recommendation: string;
  alternatives: { label: string; description: string; risk: string }[];
  rationale: string;
  confidence: number;
  accepted: boolean;
  acceptedBy?: string;
  acceptedAt?: string;
  modelVersion: string;
}

// ─── Impact Assessment Types ────────────────────────────────

export interface ScopeAnalysis {
  packages: string[];
  modules: string[];
  entryPoints: string[];
  files: number;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  increase: string[];
  reduction: string[];
}

export interface EffortEstimate {
  level: 'small' | 'medium' | 'large';
  description: string;
  filesAffected: number;
  dependencyRadius: number;
}

export interface HealthPrediction {
  current: number;
  predicted: number;
  delta: number;
}

export interface Recommendation {
  category: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ImpactAssessment {
  id: string;
  workspaceId: string;
  planId?: string;
  target: string;
  createdAt: string;
  confidence: number;
  scope: ScopeAnalysis;
  risk: RiskAssessment;
  effort: EffortEstimate;
  health: HealthPrediction;
  recommendations: Recommendation[];
  narrative?: string;
  modelVersion: string;
}

// ─── Prediction Accuracy Types ──────────────────────────────

export interface PredictionAccuracy {
  id: string;
  assessmentId: string;
  changeSetId: string;
  verificationId: string;
  predictedHealthDelta: number;
  actualHealthDelta: number;
  error: number;
  absoluteError: number;
  recordedAt: string;
}

// ─── Trend Analysis Types ───────────────────────────────────

export interface CheckTrend {
  type: string;
  totalRuns: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  isFlaky: boolean;
}

export interface TrendReport {
  workspaceId: string;
  totalReports: number;
  checkTrends: CheckTrend[];
  overallPassRate: number;
  flakyChecks: string[];
  generatedAt: string;
}

// ─── Verification Types ─────────────────────────────────────

export type VerificationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
export type VerificationType = 'typecheck' | 'test' | 'build' | 'lint' | 'filesystem' | 'artifact-consistency';

export interface VerificationCheck {
  id: string;
  type: VerificationType;
  status: VerificationStatus;
  command?: string;
  output?: string;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
}

export interface VerificationReport {
  id: string;
  workspaceId: string;
  planId: string;
  changeSetId: string;
  status: VerificationStatus;
  checks: VerificationCheck[];
  summary: { total: number; passed: number; failed: number; skipped: number };
  createdAt: string;
  completedAt: string | null;
}

// ─── Collaboration Types ────────────────────────────────────

export type ReviewStatus = 'draft' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'completed';

export interface Approval {
  id: string;
  reviewer: string;
  decision: 'approve' | 'reject';
  comment?: string;
  createdAt: string;
}

export interface CollaborationComment {
  id: string;
  artifactType: 'plan' | 'changeset' | 'verification';
  artifactId: string;
  author: string;
  message: string;
  createdAt: string;
}

export interface Ownership {
  owner: string;
  contributors: string[];
  reviewers: string[];
}

export interface CollaborationRecord {
  id: string;
  workspaceId: string;
  changeSetId: string;
  planId: string;
  verificationId: string | null;
  status: ReviewStatus;
  approvals: Approval[];
  comments: CollaborationComment[];
  ownership: Ownership;
  createdAt: string;
  updatedAt: string;
}

// ─── Agent Types ────────────────────────────────────────────

export type AgentRole =
  | 'architect'
  | 'developer'
  | 'verifier'
  | 'documenter'
  | 'security'
  | 'devops'
  | 'testing'
  | 'ux'
  | 'performance'
  | 'database'
  | 'release'
  | 'governance'
  | 'conversation'
  | 'planning'
  | 'refactoring'
  | 'custom'
  | 'dashboard-curator'
  | 'frontend'
  | 'analyst'
  | 'reviewer'
  | 'tester'
  | 'continuous-tester'
  | 'security-agent'
  | 'performance-agent'
  | 'documentation-agent'
  | 'refactoring-agent'
  | 'release-agent';

export type AgentSkillName =
  | 'task-decomposition'
  | 'risk-assessment'
  | 'dependency-analysis'
  | 'effort-estimation'
  | 'impact-prediction'
  | 'code-generation'
  | 'code-review'
  | 'testing'
  | 'security-audit'
  | 'performance-benchmark'
  | 'documentation'
  | 'refactoring'
  | 'release-management'
  | 'ci-cd'
  | 'database-design'
  | 'api-design'
  | 'ui-development'
  | 'architecture-analysis'
  | 'design-review';

export interface AgentSkill {
  name: AgentSkillName;
  proficiency: 1 | 2 | 3 | 4 | 5;
  description: string;
}

export type AgentCapability =
  | 'architecture-analysis'
  | 'design-review'
  | 'dependency-analysis'
  | 'code-generation'
  | 'refactoring'
  | 'bug-fixing'
  | 'testing'
  | 'diagnostics'
  | 'quality-analysis'
  | 'documentation'
  | 'summarization'
  | 'knowledge-management'
  | 'security-analysis'
  | 'devops-automation'
  | 'performance-optimization'
  | 'database-design'
  | 'release-management'
  | 'ux-design'
  | 'conversation'
  | 'conversation-design'
  | 'voice-ux'
  | 'prompt-engineering'
  | 'stt-integration'
  | 'tts-integration'
  | 'vad-integration'
  | 'audio-pipeline'
  | 'dashboard-monitoring'
  | 'react-development'
  | 'ui-development'
  | 'tailwind-css'
  | 'dashboard-design'
  | 'data-visualization'
  | 'progress-tracking'
  | 'milestone-management'
  | 'feature-detection'
  | 'development-velocity'
  | 'planning'
  | 'governance'
  | (string & {});

export interface AgentPermission {
  resource: 'repository' | 'changeset' | 'verification' | 'collaboration' | 'plan' | 'knowledge';
  action: 'read' | 'create' | 'modify' | 'execute';
  approvalRequired: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: AgentRole;
  description?: string;
  capabilities: AgentCapability[];
  permissions: AgentPermission[];
  provider?: string;
  model?: string;
  teamId?: string;
  color?: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface AgentTeam {
  id: string;
  name: string;
  description: string;
  leaderAgentId?: string;
  memberIds: string[];
  sharedContext?: string;
  activeWorkflowId?: string;
  createdAt: string;
}

export type AgentExecutionStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AgentExecution {
  id: string;
  agentId: string;
  task: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  status: AgentExecutionStatus;
  startedAt: string;
  completedAt?: string;
  result?: string;
}

// ─── Agent Schedule Types ───────────────────────────────────

export type ScheduleFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'custom';

export interface AgentSchedule {
  id: string;
  agentId: string;
  task: string;
  frequency: ScheduleFrequency;
  cronExpression?: string;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: string;
  enabled: boolean;
  createdAt: string;
}

// ─── Agent Memory Types ──────────────────────────────────────

export interface AgentMemoryEntry {
  id: string;
  agentId: string;
  type: 'execution' | 'observation' | 'pattern' | 'decision' | 'feedback';
  summary: string;
  detail: string;
  tags: string[];
  confidence: number;
  createdAt: string;
}

// ─── Execution Session Types ─────────────────────────────────

export type ExecutionSessionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionSession {
  id: string;
  goal: string;
  workflowId?: string;
  assignedAgentIds: string[];
  planIds: string[];
  changeSetIds: string[];
  verificationIds: string[];
  logs: string[];
  timeline: Array<{ step: string; agentId: string; status: string; timestamp: string }>;
  approvals: Array<{ agentId: string; approved: boolean; reason?: string; timestamp: string }>;
  metrics: {
    duration: number;
    totalSteps: number;
    completedSteps: number;
    artifactCount: number;
  };
  status: ExecutionSessionStatus;
  createdAt: string;
  completedAt?: string;
}

// ─── Knowledge Graph Types ──────────────────────────────────

export type KnowledgeNodeType =
  | 'repository'
  | 'module'
  | 'component'
  | 'decision'
  | 'pattern'
  | 'incident'
  | 'agent'
  | 'artifact';

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  name: string;
  description: string;
  sourceArtifacts: string[];
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeRelationType =
  | 'depends-on'
  | 'implemented-by'
  | 'verified-by'
  | 'approved-by'
  | 'derived-from'
  | 'replaced-by';

export interface KnowledgeRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: KnowledgeRelationType;
  createdAt: string;
}

// ─── Engineering Session Types ──────────────────────────────

export type SessionStatus = 'created' | 'planning' | 'executing' | 'verifying' | 'reviewing' | 'completed' | 'failed';

export interface SessionParticipant {
  id: string;
  type: 'human' | 'agent';
  role: string;
}

export interface EngineeringSession {
  id: string;
  title: string;
  objective: string;
  status: SessionStatus;
  participants: SessionParticipant[];
  artifacts: string[];
  createdAt: string;
  completedAt?: string;
}

export interface WorkflowStep {
  order: number;
  agentId: string;
  requiredArtifact: 'plan' | 'changeset' | 'verification';
  approvalRequired: boolean;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export interface WorkspaceEvent {
  id: string;
  sessionId: string;
  type: string;
  actor: 'human' | 'agent' | 'system';
  artifactId: string;
  message: string;
  timestamp: string;
}

// ─── Agent Worker Types ─────────────────────────────────────

export type WorkerType = 'in-process' | 'subprocess' | 'remote';
export type WorkerEventType = 'log' | 'output' | 'progress' | 'error' | 'complete';

export interface WorkerConfig {
  type: WorkerType;
  agentId: string;
  timeout: number;
  maxMemory?: number;
  allowedCapabilities: string[];
}

export interface WorkerEvent {
  id: string;
  executionId: string;
  type: WorkerEventType;
  message: string;
  timestamp: string;
  data?: unknown;
}

// ─── OS Integration Types ───────────────────────────────────

export interface OSService {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  version: string;
  startedAt: string;
  uptime: number;
}

export interface SystemInfo {
  version: string;
  platform: string;
  hostname: string;
  uptime: number;
  memory: { total: number; free: number };
  workspaces: number;
  services: number;
}

// ─── Cloud Execution Types ──────────────────────────────────

export interface CloudJob {
  id: string;
  type: string;
  target: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workerType: 'local' | 'remote' | 'container';
  submittedAt: string;
  completedAt?: string;
  result?: string;
}

export interface CloudWorker {
  id: string;
  name: string;
  type: 'local' | 'remote' | 'container';
  status: 'idle' | 'working' | 'offline';
  currentJob?: string;
  resources: { cpu: number; memory: number };
}

// ─── Auto-Index Types ──────────────────────────────────────

export interface IndexStats {
  totalArtifacts: number;
  indexedArtifacts: number;
  lastIndexed: string | null;
}

// ─── Execution Engine Types ─────────────────────────────────

export type ExecJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecProgressType = 'log' | 'progress' | 'result' | 'error' | 'complete';

export interface ExecProgressEvent {
  id: string;
  jobId: string;
  type: ExecProgressType;
  message: string;
  progress?: number;
  timestamp: string;
}

export interface ExecJob {
  id: string;
  type: string;
  target: string;
  status: ExecJobStatus;
  events: ExecProgressEvent[];
  createdAt: string;
  completedAt?: string;
}

// ─── Plugin Types ───────────────────────────────────────────

export interface PluginPermission {
  resource: string;
  action: 'read' | 'write' | 'execute';
}

export interface PluginDefinition {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  permissions: PluginPermission[];
  hooks: string[];
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface PluginExecution {
  id: string;
  pluginId: string;
  hook: string;
  status: 'success' | 'failed';
  duration: number;
  message: string;
  timestamp: string;
}

// ─── Enterprise Types ───────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  description: string;
  members: string[];
  role: 'admin' | 'engineer' | 'viewer';
  createdAt: string;
}

export interface EnterpriseProject {
  id: string;
  name: string;
  goal: string;
  repositories: string[];
  status: 'active' | 'archived';
  createdAt: string;
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  artifactType: 'plan' | 'changeset' | 'verification';
  requiredApprovers: number;
  roles: string[];
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  resource: string;
  details: string;
  timestamp: string;
}

// ─── Engineering Memory Types ──────────────────────────────

export interface EngineeringPattern {
  id: string;
  goal: string;
  keywords: string[];
  planId: string;
  changeSetId: string | null;
  verificationId: string | null;
  outcome: 'success' | 'partial' | 'failed';
  healthDelta: number;
  riskLevel: string;
  effortLevel: string;
  recordedAt: string;
}

export interface PatternMatch {
  pattern: EngineeringPattern;
  relevance: number;
}

// ─── Workflow Intelligence Types ────────────────────────────

export interface WorkflowContext {
  reason: string;
  confidence: number;
  factors: string[];
  command: string;
  label: string;
}

// ─── Workflow Types ─────────────────────────────────────────

export type WorkflowId = 'feature' | 'bugfix' | 'review';

export interface WorkflowStepDef {
  id: string;
  label: string;
  command: string;
  description: string;
  required: boolean;
}

export interface Workflow {
  id: WorkflowId;
  name: string;
  description: string;
  goal: string;
  steps: WorkflowStepDef[];
  currentStep: number;
  completedSteps: string[];
  status: 'not-started' | 'in-progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// ─── Desktop Types ──────────────────────────────────────────

export interface DesktopPanel {
  id: string;
  type: 'dashboard' | 'repository' | 'plans' | 'agents' | 'memory' | 'terminal';
  visible: boolean;
  order: number;
}

export interface DesktopSession {
  id: string;
  lastWorkspacePath: string | null;
  openPanels: DesktopPanel[];
  activePlanId: string | null;
  pinnedRepositories: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Organization Types ─────────────────────────────────────

export interface OrganizationRepository {
  id: string;
  path: string;
  name: string;
  lastIndexed: string | null;
}

export interface Organization {
  id: string;
  name: string;
  description: string;
  repositories: OrganizationRepository[];
  createdAt: string;
  updatedAt: string;
}

// ─── Stage Timings ───────────────────────────────────────────

export interface StageTimings {
  discover: number;
  fingerprint: number;
  analyze: number;
  index: number;
  present: number;
  session: number;
  total: number;
}

// ─── Open Result ─────────────────────────────────────────────

export interface OpenResult {
  workspace: RepositoryWorkspace;
  duration: number;
  timings: StageTimings;
  deferredIndex?: boolean;
}
