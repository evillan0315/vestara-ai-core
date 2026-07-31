import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EventBus } from '@vestara/event-bus';
import type { HealthStatus, ServiceStatus, VestaraService } from '@vestara/shared';
import type {
  DocumentationAuthority,
  DocumentationBaseline,
  DocumentationBaselineResult,
  DocumentationHealth,
  DocumentationImpactRequest,
  DocumentationImpactResult,
  DocumentationInventory,
  DocumentationPlan,
  DocumentationProposal,
  DocumentationReport,
  DocumentationRepositoryConfig,
  DocumentationVerificationEvidence,
  DocumentationVerificationProfile,
} from './domain.js';
import { createDocumentEntity } from './parser.js';
import { DocumentationImpactAnalyzer, DocumentationPlanner } from './planning.js';
import { DocumentationRequirementRegistry } from './requirements.js';
import { DocumentationScanner } from './scanner.js';
import { DocumentationStandardsRegistry } from './standards.js';

export interface DocumentationServiceOptions {
  repositories: readonly DocumentationRepositoryConfig[];
  workspaceId: string;
  stateDirectory?: string;
  eventBus?: EventBus;
}

interface DocumentationState {
  plans: DocumentationPlan[];
  proposals: DocumentationProposal[];
  reports: DocumentationReport[];
}

const NEVER_AUTOMATICALLY_APPLY: readonly DocumentationAuthority[] = ['constitutional', 'governance', 'architecture'];

function score(passed: number, total: number): number {
  return total === 0 ? 100 : Math.round((passed / total) * 100);
}

export class DocumentationService implements VestaraService {
  readonly id = 'documentation-automation';
  readonly version = '0.1.0';
  private _status: ServiceStatus = 'uninitialized';
  private readonly scanner = new DocumentationScanner();
  private readonly standards = new DocumentationStandardsRegistry();
  readonly requirements = new DocumentationRequirementRegistry();
  private readonly impactAnalyzer = new DocumentationImpactAnalyzer();
  private readonly planner = new DocumentationPlanner();
  private readonly startedAt = Date.now();
  private inventory: DocumentationInventory | null = null;
  private lastVerification: DocumentationVerificationEvidence | null = null;
  private lastFailure: string | null = null;
  private state: DocumentationState = { plans: [], proposals: [], reports: [] };

  constructor(private readonly options: DocumentationServiceOptions) {}

  get status(): ServiceStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this._status = 'initializing';
    this.loadState();
    this._status = 'initialized';
  }

  async start(): Promise<void> {
    if (this._status === 'uninitialized') await this.initialize();
    this._status = 'starting';
    this._status = 'running';
  }

  async stop(): Promise<void> {
    this._status = 'stopping';
    this.persistState();
    this._status = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
    this._status = 'disposed';
  }

  async health(): Promise<HealthStatus> {
    return {
      status: this.lastFailure ? 'degraded' : 'healthy',
      serviceId: this.id,
      version: this.version,
      uptime: Date.now() - this.startedAt,
      lastHealthCheck: new Date().toISOString(),
      dependencies: [],
      message: this.lastFailure ?? undefined,
    };
  }

  getStatus(): Record<string, unknown> {
    return {
      serviceStatus: this.status,
      health: this.inventory ? this.computeHealth(this.inventory) : null,
      inventory: this.inventory?.summary ?? null,
      activePlans: this.state.plans.filter((plan) => !['completed', 'failed'].includes(plan.status)).length,
      activeTasks: this.state.plans
        .flatMap((plan) => plan.tasks)
        .filter((task) => !['verified', 'failed'].includes(task.status)).length,
      queueDepth: this.state.plans.flatMap((plan) => plan.tasks).filter((task) => task.status === 'pending').length,
      pendingProposals: this.state.proposals.filter((proposal) => proposal.status === 'proposed').length,
      lastScan: this.inventory?.generatedAt ?? null,
      lastSuccessfulVerification: this.lastVerification?.completedAt ?? null,
      lastFailure: this.lastFailure,
    };
  }

  async scan(): Promise<DocumentationInventory> {
    await this.emit('documentation.inventory-started', {});
    try {
      const base = this.scanner.scan(this.options.repositories);
      const validationFindings = base.documents.flatMap((document) =>
        this.standards.validate(document, base, 'standard').ruleResults.flatMap((result) => result.findings),
      );
      const duplicateFindings = this.duplicateIdentityFindings(base);
      const findings = [...base.findings, ...validationFindings, ...duplicateFindings];
      this.inventory = {
        ...base,
        findings,
        summary: {
          ...base.summary,
          errors: findings.filter((finding) => finding.severity === 'error').length,
          warnings: findings.filter((finding) => finding.severity === 'warning').length,
          invalid: new Set(findings.flatMap((finding) => (finding.documentId ? [finding.documentId] : []))).size,
        },
      };
      for (const item of findings) {
        await this.emit(
          item.ruleId.includes('stale') ? 'documentation.drift-detected' : 'documentation.finding-created',
          { findingId: item.id, ruleId: item.ruleId, severity: item.severity, documentId: item.documentId },
        );
      }
      await this.emit('documentation.inventory-completed', { summary: this.inventory.summary });
      return this.inventory;
    } catch (error) {
      this.lastFailure = error instanceof Error ? error.message : String(error);
      await this.emit('documentation.failed', { operation: 'scan', error: this.lastFailure });
      throw error;
    }
  }

  getInventory(): DocumentationInventory | null {
    return this.inventory;
  }

  getFindings() {
    return this.inventory?.findings ?? [];
  }

  listStandards() {
    return this.standards
      .all()
      .map(({ id, description, severity, profiles }) => ({ id, description, severity, profiles }));
  }

  createBaseline(severities: readonly ('warning' | 'error')[] = ['error']): DocumentationBaseline {
    if (!this.inventory) throw new Error('Run documentation scan before creating a baseline');
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      findingIds: this.inventory.findings
        .filter((finding) => severities.includes(finding.severity as 'warning' | 'error'))
        .map((finding) => finding.id)
        .sort(),
    };
  }

  async checkBaseline(baseline: DocumentationBaseline): Promise<DocumentationBaselineResult> {
    if (baseline.version !== 1 || !Array.isArray(baseline.findingIds))
      throw new Error('Unsupported documentation baseline');
    const inventory = this.inventory ?? (await this.scan());
    const current = inventory.findings.filter((finding) => finding.severity === 'error');
    const known = new Set(baseline.findingIds);
    const currentIds = new Set(current.map((finding) => finding.id));
    const introduced = current.filter((finding) => !known.has(finding.id));
    return {
      passed: introduced.length === 0,
      baselineCount: baseline.findingIds.length,
      currentCount: current.length,
      introduced,
      resolvedIds: baseline.findingIds.filter((id) => !currentIds.has(id)),
    };
  }

  async analyzeImpact(request: DocumentationImpactRequest): Promise<DocumentationImpactResult> {
    const inventory = this.inventory ?? (await this.scan());
    const result = this.impactAnalyzer.analyze(request, inventory);
    await this.emit('documentation.impact-analyzed', {
      executionId: request.executionId,
      changedPaths: request.changedPaths,
      impactedDocuments: result.impactedDocuments.length,
    });
    return result;
  }

  async createPlan(
    source: DocumentationPlan['source'] = 'repository-scan',
    findingIds?: readonly string[],
  ): Promise<DocumentationPlan> {
    const inventory = this.inventory ?? (await this.scan());
    const selected = findingIds
      ? inventory.findings.filter((finding) => findingIds.includes(finding.id))
      : inventory.findings;
    const plan = this.planner.create(this.options.workspaceId, source, selected);
    this.state.plans.push(plan);
    this.persistState();
    await this.emit('documentation.plan-created', { planId: plan.id, tasks: plan.tasks.length });
    for (const task of plan.tasks)
      await this.emit('documentation.task-created', { planId: plan.id, taskId: task.id, role: task.role });
    return plan;
  }

  listPlans(): readonly DocumentationPlan[] {
    return this.state.plans;
  }

  getPlan(id: string): DocumentationPlan | undefined {
    return this.state.plans.find((plan) => plan.id === id);
  }

  createFirstChore(packagePath = 'packages/state-machine'): DocumentationPlan {
    const plan = this.planner.firstChore(packagePath);
    this.state.plans.push(plan);
    this.persistState();
    return plan;
  }

  async runPlan(planId: string, dryRun = true): Promise<readonly DocumentationProposal[]> {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`Documentation plan not found: ${planId}`);
    const inventory = this.inventory ?? (await this.scan());
    const proposals: DocumentationProposal[] = [];
    for (const task of plan.tasks.filter((item) => item.operation === 'create' || item.operation === 'update')) {
      if (!task.documentPath) continue;
      const existing = inventory.documents.find((document) => document.path === task.documentPath);
      const repository = existing
        ? this.options.repositories.find((item) => item.id === existing.repositoryId)
        : (this.options.repositories.find((item) => item.id === 'vestara-ai-core') ?? this.options.repositories[0]);
      if (!repository) continue;
      const authority = existing?.authority ?? 'implementation';
      const content = existing?.parsed.content ?? this.proposalTemplate(task.title, task.documentPath);
      const entity = createDocumentEntity(repository, task.documentPath, content);
      const validationResult = this.standards.validate(entity, inventory, 'standard');
      const proposal: DocumentationProposal = {
        id: `doc-proposal-${Date.now()}-${proposals.length + 1}`,
        planId,
        taskId: task.id,
        repositoryId: repository.id,
        documentPath: task.documentPath,
        authority,
        operation: existing ? 'update' : 'create',
        beforeChecksum: existing?.checksum,
        proposedContent: content,
        rationale: `${task.title}. Generated as a reviewable proposal from finding evidence; no claim is considered verified by generation.`,
        evidenceRefs: task.findingIds,
        validationResult,
        status: 'proposed',
        createdAt: new Date().toISOString(),
      };
      proposals.push(proposal);
      this.state.proposals.push(proposal);
      await this.emit('documentation.proposal-created', { planId, taskId: task.id, proposalId: proposal.id, dryRun });
      if (task.approvalRequired || NEVER_AUTOMATICALLY_APPLY.includes(authority)) {
        await this.emit('documentation.approval-requested', {
          planId,
          taskId: task.id,
          proposalId: proposal.id,
          authority,
        });
      }
    }
    this.persistState();
    return proposals;
  }

  listProposals(): readonly DocumentationProposal[] {
    return this.state.proposals;
  }

  getProposal(id: string): DocumentationProposal | undefined {
    return this.state.proposals.find((proposal) => proposal.id === id);
  }

  async decideProposal(id: string, decision: 'approve' | 'reject', actor: string): Promise<DocumentationProposal> {
    const proposal = this.requireProposal(id);
    if (proposal.status !== 'proposed') throw new Error(`Proposal is not awaiting approval: ${id}`);
    const updated: DocumentationProposal = {
      ...proposal,
      status: decision === 'approve' ? 'approved' : 'rejected',
      approvedBy: decision === 'approve' ? actor : undefined,
    };
    this.replaceProposal(updated);
    await this.emit(decision === 'approve' ? 'documentation.proposal-approved' : 'documentation.proposal-rejected', {
      proposalId: id,
      actor,
    });
    return updated;
  }

  async applyProposal(id: string, actor: string): Promise<DocumentationProposal> {
    const proposal = this.requireProposal(id);
    if (proposal.status !== 'approved') throw new Error('Only approved documentation proposals can be applied');
    if (proposal.authority === 'constitutional')
      throw new Error('Constitutional documents cannot be applied by documentation automation');
    if (proposal.authority === 'governance' || proposal.authority === 'architecture') {
      throw new Error(
        'Governance and architecture proposals require an ADR-governed human workflow and remain proposal-only',
      );
    }
    if (!proposal.validationResult.valid)
      throw new Error('Proposal must pass deterministic validation before application');
    const repository = this.options.repositories.find((item) => item.id === proposal.repositoryId);
    if (!repository?.writable)
      throw new Error(`Repository is not writable by documentation automation: ${proposal.repositoryId}`);
    const target = path.resolve(repository.path, proposal.documentPath);
    if (!target.startsWith(path.resolve(repository.path) + path.sep))
      throw new Error('Proposal path escapes repository root');
    if (fs.existsSync(target) && proposal.beforeChecksum) {
      const current = createDocumentEntity(repository, proposal.documentPath, fs.readFileSync(target, 'utf8'));
      if (current.checksum !== proposal.beforeChecksum) {
        const conflicted = { ...proposal, status: 'conflicted' as const };
        this.replaceProposal(conflicted);
        throw new Error('Proposal conflict: document changed after proposal creation');
      }
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, proposal.proposedContent, 'utf8');
    const applied = { ...proposal, status: 'applied' as const, approvedBy: actor };
    this.replaceProposal(applied);
    await this.emit('documentation.published', {
      proposalId: id,
      actor,
      path: proposal.documentPath,
      mode: 'approved-local-apply',
    });
    return applied;
  }

  async verify(profile: DocumentationVerificationProfile = 'standard'): Promise<DocumentationVerificationEvidence> {
    const startedAt = new Date().toISOString();
    await this.emit('documentation.verification-started', { profile });
    const inventory = this.inventory ?? (await this.scan());
    const ruleResults = inventory.documents.flatMap(
      (document) => this.standards.validate(document, inventory, profile).ruleResults,
    );
    const completedAt = new Date().toISOString();
    const evidence: DocumentationVerificationEvidence = {
      evidenceId: `doc-evidence-${Date.now()}`,
      verificationId: `doc-verification-${Date.now()}`,
      ruleResults,
      linksChecked: inventory.documents.reduce((total, document) => total + document.parsed.links.length, 0),
      referencesChecked: inventory.documents.reduce((total, document) => total + document.relatedEntityIds.length, 0),
      examplesChecked: inventory.documents.reduce((total, document) => total + document.parsed.codeFences.length, 0),
      commandsChecked: inventory.documents.reduce(
        (total, document) =>
          total + document.parsed.codeFences.filter((fence) => /^(?:bash|sh|shell)$/.test(fence.language)).length,
        0,
      ),
      implementationRefsChecked: inventory.documents.reduce(
        (total, document) => total + document.implementationRefs.length,
        0,
      ),
      startedAt,
      completedAt,
      reportArtifactId: `documentation-report://${Date.now()}`,
    };
    this.lastVerification = evidence;
    const report = this.createReport(evidence);
    this.state.reports.push(report);
    this.persistState();
    await this.emit('documentation.verification-completed', {
      verificationId: evidence.verificationId,
      evidenceId: evidence.evidenceId,
      passed: ruleResults.every((result) => result.passed),
    });
    return evidence;
  }

  createReport(evidence = this.lastVerification ?? undefined): DocumentationReport {
    if (!this.inventory) throw new Error('Run documentation scan before generating a report');
    return {
      id: `doc-report-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      inventory: this.inventory,
      health: this.computeHealth(this.inventory),
      evidence,
    };
  }

  listReports(): readonly DocumentationReport[] {
    return this.state.reports;
  }

  reportAsMarkdown(report: DocumentationReport): string {
    const summary = report.inventory.summary;
    return `# Documentation Verification Report\n\nGenerated: ${report.generatedAt}\n\n## Health\n\n- Overall: ${report.health.overall}%\n- Completeness: ${report.health.completeness}%\n- Standards compliance: ${report.health.standardsCompliance}%\n- Link integrity: ${report.health.linkIntegrity}%\n- Implementation alignment: ${report.health.implementationAlignment}%\n- Freshness: ${report.health.freshness}%\n- Verification: ${report.health.verification}%\n\n## Inventory\n\n- Documents: ${summary.documents}\n- Missing: ${summary.missing}\n- Invalid: ${summary.invalid}\n- Errors: ${summary.errors}\n- Warnings: ${summary.warnings}\n`;
  }

  private computeHealth(inventory: DocumentationInventory): DocumentationHealth {
    const findings = inventory.findings;
    const packageRequirements = findings.filter((item) => item.ruleId === 'package-required-document');
    const ruleFindings = findings.filter((item) => item.documentId);
    const linkFindings = findings.filter((item) => item.ruleId === 'relative-links');
    const alignmentFindings = findings.filter((item) =>
      /implementation|verified-claim|package-name|route|command/.test(item.ruleId),
    );
    const stale = inventory.documents.filter((document) => document.status === 'stale').length;
    const dimensions = {
      completeness: score(
        Math.max(0, inventory.documents.length - packageRequirements.length),
        inventory.documents.length,
      ),
      standardsCompliance: score(
        Math.max(0, inventory.documents.length - new Set(ruleFindings.map((item) => item.documentId)).size),
        inventory.documents.length,
      ),
      linkIntegrity: score(Math.max(0, inventory.documents.length - linkFindings.length), inventory.documents.length),
      implementationAlignment: score(
        Math.max(0, inventory.documents.length - alignmentFindings.length),
        inventory.documents.length,
      ),
      freshness: score(inventory.documents.length - stale, inventory.documents.length),
      verification: this.lastVerification ? 100 : 0,
    };
    return { ...dimensions, overall: Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / 6) };
  }

  private duplicateIdentityFindings(inventory: DocumentationInventory) {
    const findings = [];
    const ids = new Map<string, string>();
    for (const document of inventory.documents) {
      const raw = document.parsed.frontmatter.id;
      const id = typeof raw === 'string' ? raw : raw?.[0];
      if (!id) continue;
      const previous = ids.get(id);
      if (previous) {
        findings.push({
          id: `finding://duplicate-id/${id}/${document.repositoryId}`,
          ruleId: document.kind === 'adr' ? 'unique-adr-id' : 'unique-document-id',
          severity: 'error' as const,
          documentId: document.id,
          message: `Duplicate document identity ${id}: ${previous} and ${document.path}`,
          evidence: [
            { kind: 'document' as const, ref: previous },
            { kind: 'document' as const, ref: document.path },
          ],
          suggestedAction: { operation: 'review' as const, path: document.path },
        });
      } else ids.set(id, document.path);
    }
    return findings;
  }

  private proposalTemplate(title: string, documentPath: string): string {
    return `---\ntitle: "${title.replace(/"/g, "'")}"\nstatus: proposed\nversion: 0.1.0\nowner: documentation-automation\n---\n\n# ${path.basename(documentPath, path.extname(documentPath))}\n\n## Overview\n\nProposed documentation generated from deterministic inventory findings.\n\n## Verification\n\nThis proposal is unverified until deterministic checks and human review complete.\n`;
  }

  private requireProposal(id: string): DocumentationProposal {
    const proposal = this.getProposal(id);
    if (!proposal) throw new Error(`Documentation proposal not found: ${id}`);
    return proposal;
  }

  private replaceProposal(proposal: DocumentationProposal): void {
    this.state.proposals = this.state.proposals.map((item) => (item.id === proposal.id ? proposal : item));
    this.persistState();
  }

  private stateFile(): string | null {
    return this.options.stateDirectory ? path.join(this.options.stateDirectory, 'documentation-state.json') : null;
  }

  private loadState(): void {
    const file = this.stateFile();
    if (!file || !fs.existsSync(file)) return;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && 'plans' in parsed && 'proposals' in parsed && 'reports' in parsed) {
        this.state = parsed as DocumentationState;
      }
    } catch (error) {
      this.lastFailure = `Unable to load documentation state: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private persistState(): void {
    const file = this.stateFile();
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.options.eventBus?.emit({
      type,
      source: this.id,
      actor: { id: this.id, role: 'system' },
      payload: { workspaceId: this.options.workspaceId, ...payload },
      metadata: { correlationId: `documentation-${this.options.workspaceId}` },
    });
  }
}
