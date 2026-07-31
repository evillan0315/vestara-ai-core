import type { GraphEntity, GraphRelationship } from '@vestara/engineering-graph';

export type DocumentationAuthority =
  | 'constitutional'
  | 'governance'
  | 'architecture'
  | 'standard'
  | 'specification'
  | 'implementation'
  | 'reference'
  | 'guide'
  | 'generated';

export type DocumentationKind =
  | 'constitution'
  | 'governance'
  | 'adr'
  | 'blueprint'
  | 'standard'
  | 'specification'
  | 'readme'
  | 'architecture'
  | 'api'
  | 'testing'
  | 'operations'
  | 'migration'
  | 'troubleshooting'
  | 'guide'
  | 'tutorial'
  | 'reference'
  | 'changelog'
  | 'generated-report';

export type DocumentationStatus =
  | 'current'
  | 'stale'
  | 'missing'
  | 'invalid'
  | 'conflicting'
  | 'unverified'
  | 'proposed'
  | 'deprecated'
  | 'superseded';

export type DocumentationSeverity = 'info' | 'warning' | 'error';
export type DocumentationVerificationProfile = 'fast' | 'standard' | 'strict';

export interface DocumentationImplementationRef {
  repository?: string;
  path: string;
  revision?: string;
  symbol?: string;
}

export interface ParsedDocument {
  path: string;
  content: string;
  frontmatter: Readonly<Record<string, string | readonly string[]>>;
  headings: readonly string[];
  links: readonly string[];
  codeFences: readonly { language: string; content: string; closed: boolean }[];
}

export interface DocumentationEntity {
  readonly id: string;
  readonly repositoryId: string;
  readonly repositoryPath: string;
  readonly path: string;
  readonly kind: DocumentationKind;
  readonly authority: DocumentationAuthority;
  readonly status: DocumentationStatus;
  readonly title?: string;
  readonly version?: string;
  readonly owner?: string;
  readonly lastReviewedAt?: string;
  readonly nextReviewAt?: string;
  readonly implementationRefs: readonly DocumentationImplementationRef[];
  readonly relatedEntityIds: readonly string[];
  readonly relatedAdrIds: readonly string[];
  readonly checksum: string;
  readonly parsed: ParsedDocument;
}

export interface DocumentationEvidenceRef {
  readonly kind: 'file' | 'package' | 'route' | 'command' | 'symbol' | 'document' | 'check';
  readonly ref: string;
  readonly detail?: string;
}

export interface DocumentationFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: DocumentationSeverity;
  readonly documentId?: string;
  readonly entityId?: string;
  readonly message: string;
  readonly evidence: readonly DocumentationEvidenceRef[];
  readonly suggestedAction?: { operation: 'create' | 'update' | 'review' | 'deprecate'; path?: string };
}

export interface DocumentationRequirementSelector {
  readonly entityKinds?: readonly ('package' | 'adr' | 'capability' | 'repository')[];
  readonly packagePrivate?: boolean;
  readonly authorities?: readonly DocumentationAuthority[];
}

export interface DocumentationRequirement {
  readonly id: string;
  readonly appliesTo: DocumentationRequirementSelector;
  readonly requiredKinds: readonly DocumentationKind[];
  readonly optionalKinds: readonly DocumentationKind[];
  readonly requiredSections: readonly string[];
  readonly requiredFrontmatter: readonly string[];
  readonly validationRules: readonly string[];
  readonly severity: DocumentationSeverity;
}

export interface DocumentationRepositoryConfig {
  readonly id: string;
  readonly path: string;
  readonly authority: DocumentationAuthority;
  readonly writable?: boolean;
}

export interface DocumentationInventorySummary {
  readonly repositories: number;
  readonly documents: number;
  readonly current: number;
  readonly stale: number;
  readonly invalid: number;
  readonly missing: number;
  readonly errors: number;
  readonly warnings: number;
}

export interface DocumentationRepositoryInventory {
  readonly id: string;
  readonly path: string;
  readonly documents: number;
  readonly packages: readonly string[];
  readonly implementation: DocumentationImplementationInventory;
}

export interface DocumentationImplementationInventory {
  readonly packages: readonly string[];
  readonly packageScripts: Readonly<Record<string, readonly string[]>>;
  readonly publicSymbols: readonly { packagePath: string; symbol: string; sourcePath: string }[];
  readonly apiRoutes: readonly { method: string; path: string; sourcePath: string }[];
  readonly cliCommands: readonly string[];
}

export interface DocumentationInventory {
  readonly generatedAt: string;
  readonly repositories: readonly DocumentationRepositoryInventory[];
  readonly documents: readonly DocumentationEntity[];
  readonly findings: readonly DocumentationFinding[];
  readonly summary: DocumentationInventorySummary;
}

export interface DocumentationHealth {
  readonly overall: number;
  readonly completeness: number;
  readonly standardsCompliance: number;
  readonly linkIntegrity: number;
  readonly implementationAlignment: number;
  readonly freshness: number;
  readonly verification: number;
}

export interface DocumentationBaseline {
  readonly version: 1;
  readonly generatedAt: string;
  readonly findingIds: readonly string[];
}

export interface DocumentationBaselineResult {
  readonly passed: boolean;
  readonly baselineCount: number;
  readonly currentCount: number;
  readonly introduced: readonly DocumentationFinding[];
  readonly resolvedIds: readonly string[];
}

export interface DocumentationImpactRequest {
  readonly workspaceId: string;
  readonly executionId?: string;
  readonly changedPaths: readonly string[];
  readonly changedEntityIds?: readonly string[];
  readonly graphDiffRef?: string;
}

export interface ImpactedDocument {
  readonly documentId: string;
  readonly path: string;
  readonly reasons: readonly string[];
  readonly confidence: 'direct' | 'graph' | 'inferred';
}

export interface MissingDocumentRequirement {
  readonly entityId: string;
  readonly kind: DocumentationKind;
  readonly suggestedPath: string;
}

export type DocumentationAgentRoleId =
  | 'documentation-planner'
  | 'architecture-documentation-agent'
  | 'api-documentation-agent'
  | 'standards-agent'
  | 'adr-reconciliation-agent'
  | 'blueprint-reconciliation-agent'
  | 'example-validation-agent'
  | 'link-validation-agent'
  | 'diagram-agent'
  | 'documentation-verifier'
  | 'documentation-publisher';

export interface DocumentationAgentRole {
  readonly id: DocumentationAgentRoleId;
  readonly capabilities: readonly string[];
  readonly allowedAuthorities: readonly DocumentationAuthority[];
  readonly canModify: readonly DocumentationKind[];
  readonly requiresApprovalFor: readonly DocumentationKind[];
  readonly readScope: readonly string[];
  readonly writeScope: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly verificationProfile: DocumentationVerificationProfile;
}

export type DocumentationTaskStatus = 'pending' | 'assigned' | 'running' | 'proposed' | 'verified' | 'failed';

export interface DocumentationTask {
  readonly id: string;
  readonly title: string;
  readonly operation: 'create' | 'update' | 'validate' | 'verify' | 'review';
  readonly documentPath?: string;
  readonly findingIds: readonly string[];
  readonly dependsOn: readonly string[];
  readonly role: DocumentationAgentRoleId;
  readonly status: DocumentationTaskStatus;
  readonly approvalRequired: boolean;
}

export interface DocumentationPlan {
  readonly id: string;
  readonly workspaceId: string;
  readonly source: 'manual' | 'execution' | 'commit' | 'scheduled-audit' | 'repository-scan';
  readonly tasks: readonly DocumentationTask[];
  readonly status: 'draft' | 'ready' | 'running' | 'awaiting-approval' | 'completed' | 'failed';
  readonly createdAt: string;
}

export interface DocumentationImpactResult {
  readonly impactedDocuments: readonly ImpactedDocument[];
  readonly missingDocuments: readonly MissingDocumentRequirement[];
  readonly recommendedTasks: readonly DocumentationTask[];
}

export interface DocumentationRuleResult {
  readonly ruleId: string;
  readonly passed: boolean;
  readonly findings: readonly DocumentationFinding[];
}

export interface DocumentationValidationResult {
  readonly valid: boolean;
  readonly profile: DocumentationVerificationProfile;
  readonly ruleResults: readonly DocumentationRuleResult[];
}

export interface DocumentationProposal {
  readonly id: string;
  readonly planId: string;
  readonly taskId: string;
  readonly repositoryId: string;
  readonly documentPath: string;
  readonly authority: DocumentationAuthority;
  readonly operation: 'create' | 'update' | 'rename' | 'deprecate';
  readonly beforeChecksum?: string;
  readonly proposedContent: string;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
  readonly validationResult: DocumentationValidationResult;
  readonly status: 'proposed' | 'approved' | 'rejected' | 'applied' | 'conflicted';
  readonly createdAt: string;
  readonly approvedBy?: string;
}

export interface DocumentationVerificationEvidence {
  readonly evidenceId: string;
  readonly verificationId: string;
  readonly planId?: string;
  readonly taskId?: string;
  readonly documentId?: string;
  readonly ruleResults: readonly DocumentationRuleResult[];
  readonly linksChecked: number;
  readonly referencesChecked: number;
  readonly examplesChecked: number;
  readonly commandsChecked: number;
  readonly implementationRefsChecked: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly reportArtifactId: string;
}

export interface DocumentationReport {
  readonly id: string;
  readonly generatedAt: string;
  readonly inventory: DocumentationInventory;
  readonly health: DocumentationHealth;
  readonly evidence?: DocumentationVerificationEvidence;
}

export interface DocumentationGraphProjection {
  readonly entities: readonly GraphEntity[];
  readonly relationships: readonly GraphRelationship[];
}
