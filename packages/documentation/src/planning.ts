import type {
  DocumentationAgentRole,
  DocumentationAgentRoleId,
  DocumentationAuthority,
  DocumentationFinding,
  DocumentationImpactRequest,
  DocumentationImpactResult,
  DocumentationInventory,
  DocumentationPlan,
  DocumentationTask,
} from './domain.js';

const IMPLEMENTATION_AUTHORITIES: readonly DocumentationAuthority[] = [
  'implementation',
  'reference',
  'guide',
  'generated',
];

export const DOCUMENTATION_AGENT_ROLES: readonly DocumentationAgentRole[] = [
  {
    id: 'documentation-planner',
    capabilities: ['documentation.inventory.read', 'documentation.plan.create'],
    allowedAuthorities: [
      'constitutional',
      'governance',
      'architecture',
      'standard',
      'specification',
      ...IMPLEMENTATION_AUTHORITIES,
    ],
    canModify: [],
    requiresApprovalFor: [],
    readScope: ['**/*.md', '**/package.json', '**/*.ts', '**/*.tsx'],
    writeScope: [],
    requiredEvidence: ['inventory', 'findings'],
    verificationProfile: 'standard',
  },
  {
    id: 'architecture-documentation-agent',
    capabilities: ['documentation.architecture.propose'],
    allowedAuthorities: ['architecture'],
    canModify: ['architecture'],
    requiresApprovalFor: ['architecture', 'adr', 'blueprint'],
    readScope: ['**/*.md', 'packages/**/src/**'],
    writeScope: ['**/ARCHITECTURE.md'],
    requiredEvidence: ['implementation-reference', 'related-adr'],
    verificationProfile: 'strict',
  },
  {
    id: 'api-documentation-agent',
    capabilities: ['documentation.api.propose', 'documentation.api.extract'],
    allowedAuthorities: IMPLEMENTATION_AUTHORITIES,
    canModify: ['api', 'reference', 'readme'],
    requiresApprovalFor: [],
    readScope: ['packages/**/src/**', 'apps/api/src/**'],
    writeScope: ['**/API.md', '**/README.md', 'docs/api/**'],
    requiredEvidence: ['export-inventory', 'route-inventory'],
    verificationProfile: 'standard',
  },
  {
    id: 'standards-agent',
    capabilities: ['documentation.standard.validate', 'documentation.standard.propose'],
    allowedAuthorities: ['standard'],
    canModify: ['standard'],
    requiresApprovalFor: ['standard'],
    readScope: ['**/*.md'],
    writeScope: ['docs/standards/**'],
    requiredEvidence: ['rule-results'],
    verificationProfile: 'strict',
  },
  {
    id: 'adr-reconciliation-agent',
    capabilities: ['documentation.adr.reconcile'],
    allowedAuthorities: ['architecture'],
    canModify: ['adr'],
    requiresApprovalFor: ['adr'],
    readScope: ['**/*.md', 'packages/**/src/**'],
    writeScope: [],
    requiredEvidence: ['implementation-reference', 'governance-review'],
    verificationProfile: 'strict',
  },
  {
    id: 'blueprint-reconciliation-agent',
    capabilities: ['documentation.blueprint.reconcile'],
    allowedAuthorities: ['architecture', 'governance', 'constitutional'],
    canModify: ['blueprint'],
    requiresApprovalFor: ['blueprint', 'governance', 'constitution'],
    readScope: ['**/*.md', 'packages/**/src/**'],
    writeScope: [],
    requiredEvidence: ['adr-impact', 'implementation-reference', 'verification'],
    verificationProfile: 'strict',
  },
  {
    id: 'example-validation-agent',
    capabilities: ['documentation.example.validate'],
    allowedAuthorities: IMPLEMENTATION_AUTHORITIES,
    canModify: ['guide', 'tutorial', 'readme'],
    requiresApprovalFor: [],
    readScope: ['**/*.md', '**/package.json'],
    writeScope: ['**/*.md'],
    requiredEvidence: ['example-results'],
    verificationProfile: 'standard',
  },
  {
    id: 'link-validation-agent',
    capabilities: ['documentation.link.validate'],
    allowedAuthorities: [
      'constitutional',
      'governance',
      'architecture',
      'standard',
      'specification',
      ...IMPLEMENTATION_AUTHORITIES,
    ],
    canModify: [],
    requiresApprovalFor: [],
    readScope: ['**/*.md'],
    writeScope: [],
    requiredEvidence: ['link-results'],
    verificationProfile: 'fast',
  },
  {
    id: 'diagram-agent',
    capabilities: ['documentation.diagram.validate', 'documentation.diagram.propose'],
    allowedAuthorities: ['architecture', 'implementation', 'guide'],
    canModify: ['architecture', 'guide'],
    requiresApprovalFor: ['architecture'],
    readScope: ['**/*.md'],
    writeScope: ['**/*.md'],
    requiredEvidence: ['mermaid-results'],
    verificationProfile: 'standard',
  },
  {
    id: 'documentation-verifier',
    capabilities: ['documentation.verify'],
    allowedAuthorities: [
      'constitutional',
      'governance',
      'architecture',
      'standard',
      'specification',
      ...IMPLEMENTATION_AUTHORITIES,
    ],
    canModify: [],
    requiresApprovalFor: [],
    readScope: ['**/*'],
    writeScope: [],
    requiredEvidence: ['rule-results', 'diff', 'references'],
    verificationProfile: 'strict',
  },
  {
    id: 'documentation-publisher',
    capabilities: ['documentation.proposal.apply'],
    allowedAuthorities: IMPLEMENTATION_AUTHORITIES,
    canModify: [
      'readme',
      'api',
      'testing',
      'operations',
      'migration',
      'troubleshooting',
      'guide',
      'tutorial',
      'reference',
      'generated-report',
    ],
    requiresApprovalFor: [
      'readme',
      'api',
      'testing',
      'operations',
      'migration',
      'troubleshooting',
      'guide',
      'tutorial',
      'reference',
    ],
    readScope: ['**/*.md'],
    writeScope: ['**/*.md'],
    requiredEvidence: ['approval', 'verification'],
    verificationProfile: 'strict',
  },
];

function roleForFinding(finding: DocumentationFinding): DocumentationAgentRoleId {
  if (/adr/i.test(finding.ruleId) || /ADR/.test(finding.message)) return 'adr-reconciliation-agent';
  if (/blueprint|verified-claim/i.test(finding.ruleId)) return 'blueprint-reconciliation-agent';
  if (/link/i.test(finding.ruleId)) return 'link-validation-agent';
  if (/api|route|command/i.test(finding.ruleId)) return 'api-documentation-agent';
  if (/standard|frontmatter|section|version|date/i.test(finding.ruleId)) return 'standards-agent';
  return 'architecture-documentation-agent';
}

export class DocumentationImpactAnalyzer {
  analyze(request: DocumentationImpactRequest, inventory: DocumentationInventory): DocumentationImpactResult {
    const impacted = inventory.documents
      .map((document) => {
        const reasons: string[] = [];
        for (const changedPath of request.changedPaths) {
          if (
            document.implementationRefs.some(
              (reference) => changedPath.startsWith(reference.path) || reference.path.startsWith(changedPath),
            )
          ) {
            reasons.push(`Implementation reference affected by ${changedPath}`);
          }
          const packagePrefix = changedPath.match(/^(packages\/[^/]+|apps\/[^/]+)/)?.[1];
          if (packagePrefix && document.path.startsWith(packagePrefix))
            reasons.push(`Document belongs to changed entity ${packagePrefix}`);
        }
        for (const entityId of request.changedEntityIds ?? []) {
          if (document.relatedEntityIds.includes(entityId)) reasons.push(`Related graph entity changed: ${entityId}`);
        }
        return reasons.length > 0
          ? { documentId: document.id, path: document.path, reasons, confidence: 'direct' as const }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const tasks: DocumentationTask[] = impacted.map((document, index) => ({
      id: `doc-task-impact-${index + 1}`,
      title: `Reconcile ${document.path}`,
      operation: 'update',
      documentPath: document.path,
      findingIds: [],
      dependsOn: [],
      role: document.path.toLowerCase().includes('adr')
        ? 'adr-reconciliation-agent'
        : 'architecture-documentation-agent',
      status: 'pending',
      approvalRequired: /blueprint|adr|constitution|governance/i.test(document.path),
    }));
    return { impactedDocuments: impacted, missingDocuments: [], recommendedTasks: tasks };
  }
}

export class DocumentationPlanner {
  create(
    workspaceId: string,
    source: DocumentationPlan['source'],
    findings: readonly DocumentationFinding[],
  ): DocumentationPlan {
    const tasks: DocumentationTask[] = findings.map((finding, index) => ({
      id: `doc-task-${index + 1}`,
      title: finding.message,
      operation: finding.suggestedAction?.operation === 'create' ? 'create' : 'update',
      documentPath: finding.suggestedAction?.path,
      findingIds: [finding.id],
      dependsOn: [],
      role: roleForFinding(finding),
      status: 'pending',
      approvalRequired: /constitution|governance|blueprint|adr/i.test(finding.suggestedAction?.path ?? finding.message),
    }));
    const validationTask: DocumentationTask = {
      id: `doc-task-${tasks.length + 1}`,
      title: 'Validate documentation proposals',
      operation: 'validate',
      findingIds: [],
      dependsOn: tasks.map((task) => task.id),
      role: 'documentation-verifier',
      status: 'pending',
      approvalRequired: false,
    };
    return {
      id: `doc-plan-${Date.now()}`,
      workspaceId,
      source,
      tasks: tasks.length > 0 ? [...tasks, validationTask] : [],
      status: tasks.length > 0 ? 'ready' : 'completed',
      createdAt: new Date().toISOString(),
    };
  }

  firstChore(packagePath: string): DocumentationPlan {
    const task: DocumentationTask = {
      id: 'doc-first-chore-audit',
      title: `Documentation Health Audit: ${packagePath}`,
      operation: 'review',
      documentPath: packagePath,
      findingIds: [],
      dependsOn: [],
      role: 'documentation-planner',
      status: 'pending',
      approvalRequired: false,
    };
    return {
      id: `doc-first-chore-${Date.now()}`,
      workspaceId: packagePath,
      source: 'manual',
      tasks: [task],
      status: 'ready',
      createdAt: new Date().toISOString(),
    };
  }
}
