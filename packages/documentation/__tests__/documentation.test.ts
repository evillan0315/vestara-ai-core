import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InProcessEventBus } from '@vestara/event-bus';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDocumentEntity,
  DocumentationRequirementRegistry,
  DocumentationScanner,
  DocumentationService,
  DocumentationStandardsRegistry,
  PUBLIC_PACKAGE_README_FRONTMATTER,
  PUBLIC_PACKAGE_README_SECTIONS,
  parseMarkdown,
  resolveAuthority,
  validatePackageReadmeRequirement,
} from '../src/index.js';

const roots: string[] = [];
function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-docs-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'packages', 'sample', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'docs', 'documentation-owners.json'),
    '{"version":1,"approvedOwners":["documentation-automation"]}',
  );
  fs.writeFileSync(path.join(root, 'packages', 'sample', 'package.json'), '{"name":"@fixture/sample"}');
  fs.writeFileSync(
    path.join(root, 'packages', 'sample', 'src', 'index.ts'),
    'export interface PublicApi { ok: boolean }\n',
  );
  fs.writeFileSync(path.join(root, 'packages', 'sample', 'README.md'), '# Sample\n\n[broken](missing.md)\n');
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('documentation automation', () => {
  it('uses the documentation package README as the executable public-package reference', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..');
    const repository = {
      id: 'vestara-ai-core',
      path: repositoryRoot,
      authority: 'implementation' as const,
    };
    const readmePath = 'packages/documentation/README.md';
    const readme = createDocumentEntity(
      repository,
      readmePath,
      fs.readFileSync(path.join(repositoryRoot, readmePath), 'utf8'),
    );
    const requirement = new DocumentationRequirementRegistry().forPackage(false);

    expect(requirement.requiredSections).toEqual(PUBLIC_PACKAGE_README_SECTIONS);
    expect(requirement.requiredFrontmatter).toEqual(PUBLIC_PACKAGE_README_FRONTMATTER);
    expect(validatePackageReadmeRequirement(readme, requirement)).toEqual([]);
    expect(readme.status).toBe('current');
    expect(readme.implementationRefs).toContainEqual({ path: 'packages/documentation/src/index.ts' });
  });

  it('reports executable README requirement violations for public packages', () => {
    const repository = { id: 'fixture', path: '/fixture', authority: 'implementation' as const };
    const readme = createDocumentEntity(repository, 'packages/sample/README.md', '# Sample\n\n## Overview\n');
    const requirement = new DocumentationRequirementRegistry().forPackage(false);
    const violations = validatePackageReadmeRequirement(readme, requirement);

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'package-readme-required-frontmatter', field: 'owner' }),
        expect.objectContaining({ ruleId: 'package-readme-required-section', field: 'Public API' }),
      ]),
    );
  });

  it('independently verifies settings-framework against the public-package requirement', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..');
    const inventory = new DocumentationScanner().scan([
      { id: 'vestara-ai-core', path: repositoryRoot, authority: 'implementation' },
    ]);
    const findings = inventory.findings.filter(
      (finding) =>
        finding.entityId === 'package://packages/settings-framework' &&
        (finding.ruleId === 'package-required-document' || finding.ruleId.startsWith('package-readme-required-')),
    );

    expect(findings).toEqual([]);
  });

  describe('settings-framework semantic documentation acceptance', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..');
    const repository = {
      id: 'vestara-ai-core',
      path: repositoryRoot,
      authority: 'implementation' as const,
    };

    function semanticFixture(relativePath: string, mutate?: (content: string) => string) {
      const inventory = new DocumentationScanner().scan([repository]);
      const original = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
      const document = createDocumentEntity(repository, relativePath, mutate ? mutate(original) : original);
      return {
        document,
        validation: new DocumentationStandardsRegistry().validate(document, inventory, 'strict'),
      };
    }

    function expectRuleFailure(relativePath: string, ruleId: string, mutate: (content: string) => string): void {
      const { validation } = semanticFixture(relativePath, mutate);
      expect(validation.ruleResults.find((result) => result.ruleId === ruleId)?.passed).toBe(false);
    }

    it('accepts the unmodified independent package documents', () => {
      for (const name of ['README.md', 'ARCHITECTURE.md', 'TESTING.md', 'API.md']) {
        const { validation } = semanticFixture(`packages/settings-framework/${name}`);
        const semanticRuleIds = new Set([
          'implementation-reference-exists',
          'documentation-owner-resolves',
          'package-version-alignment',
          'review-dates',
          'verified-claim-evidence',
          'public-api-alignment',
          'package-command-alignment',
          'related-adr-status',
          'frontmatter-classification-alignment',
        ]);
        expect(
          validation.ruleResults
            .filter((result) => semanticRuleIds.has(result.ruleId))
            .every((result) => result.passed),
        ).toBe(true);
      }
    });

    it('rejects a missing implementation reference', () => {
      expectRuleFailure('packages/settings-framework/README.md', 'implementation-reference-exists', (content) =>
        content.replace('packages/settings-framework/src/index.ts', 'packages/settings-framework/src/missing.ts'),
      );
    });

    it('resolves repository slugs for typed cross-repository implementation references', () => {
      const { validation } = semanticFixture('packages/settings-framework/README.md', (content) =>
        content.replace(
          'authority: implementation',
          'authority: implementation\nimplementation-repository: evillan0315/vestara-ai-core',
        ),
      );
      expect(validation.ruleResults.find((result) => result.ruleId === 'implementation-reference-exists')?.passed).toBe(
        true,
      );
    });

    it('rejects an owner absent from package metadata and the approved registry', () => {
      expectRuleFailure('packages/settings-framework/README.md', 'documentation-owner-resolves', (content) =>
        content.replace('owner: settings-framework', 'owner: unknown-owner'),
      );
    });

    it('rejects a document version that differs from the package manifest', () => {
      expectRuleFailure('packages/settings-framework/README.md', 'package-version-alignment', (content) =>
        content.replace('version: 0.1.0', 'version: 9.9.9'),
      );
    });

    it('rejects review dates that are not ordered', () => {
      expectRuleFailure('packages/settings-framework/README.md', 'review-dates', (content) =>
        content.replace('next-review: 2026-11-01', 'next-review: 2026-07-01'),
      );
    });

    it('marks overdue current documentation stale', () => {
      const { document, validation } = semanticFixture('packages/settings-framework/README.md', (content) =>
        content.replace(
          'last-reviewed: 2026-08-01\nnext-review: 2026-11-01',
          'last-reviewed: 2020-01-01\nnext-review: 2020-02-01',
        ),
      );
      expect(document.status).toBe('stale');
      expect(validation.ruleResults.find((result) => result.ruleId === 'review-dates')?.passed).toBe(false);
    });

    it('rejects verified status when evidence references do not exist', () => {
      expectRuleFailure('packages/settings-framework/TESTING.md', 'verified-claim-evidence', (content) =>
        content.replaceAll('__tests__', 'missing-evidence'),
      );
    });

    it('rejects an API document missing a barrel export', () => {
      expectRuleFailure('packages/settings-framework/API.md', 'public-api-alignment', (content) =>
        content.replaceAll('AnalyticsEngine', 'RemovedAnalytics'),
      );
    });

    it('rejects a documented package command without a matching script', () => {
      expectRuleFailure('packages/settings-framework/TESTING.md', 'package-command-alignment', (content) =>
        content.replace('@vestara/settings-framework test', '@vestara/settings-framework missing-script'),
      );
    });

    it('rejects a related ADR that is not accepted or current', () => {
      expectRuleFailure(
        'packages/settings-framework/README.md',
        'related-adr-status',
        (content) => `${content}\n[Proposed ADR](../../docs/ADR/ADR-004-multi-agent-workflow.md)\n`,
      );
    });

    it('rejects declared kind and authority that disagree with classification', () => {
      expectRuleFailure('packages/settings-framework/API.md', 'frontmatter-classification-alignment', (content) =>
        content.replace('kind: api', 'kind: guide').replace('authority: reference', 'authority: implementation'),
      );
    });
  });

  it('verifies the Blueprint implementation-reference proposal against current files', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..');
    const ecosystemRoot = path.dirname(repositoryRoot);
    const proposal = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, 'docs/proposals/blueprint-implementation-reference-normalization.json'),
        'utf8',
      ),
    ) as {
      requiresHumanApproval: boolean;
      proposals: Array<{
        path: string;
        beforeChecksum: string;
        operation: 'replace' | 'remove';
        implementationRefs?: string[];
      }>;
    };

    expect(proposal.requiresHumanApproval).toBe(true);
    expect(proposal.proposals).toHaveLength(20);
    for (const item of proposal.proposals) {
      const target = path.join(ecosystemRoot, 'vestara-blueprint', item.path);
      expect(fs.existsSync(target), item.path).toBe(true);
      expect(createHash('sha256').update(fs.readFileSync(target)).digest('hex'), item.path).toBe(item.beforeChecksum);
      for (const reference of item.implementationRefs ?? []) {
        expect(fs.existsSync(path.join(repositoryRoot, reference)), reference).toBe(true);
      }
    }
  });

  it('verifies the ADR-004 reconciliation proposal without changing ADR status', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..');
    const proposal = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, 'docs/proposals/adr-004-reconciliation.json'), 'utf8'),
    ) as {
      requiresHumanApproval: boolean;
      target: string;
      targetChecksum: string;
      dependentDocument: string;
      dependentChecksum: string;
    };
    const checksum = (relativePath: string): string =>
      createHash('sha256')
        .update(fs.readFileSync(path.join(repositoryRoot, relativePath)))
        .digest('hex');

    expect(proposal.requiresHumanApproval).toBe(true);
    expect(checksum(proposal.target)).toBe(proposal.targetChecksum);
    expect(checksum(proposal.dependentDocument)).toBe(proposal.dependentChecksum);
    expect(
      parseMarkdown(proposal.target, fs.readFileSync(path.join(repositoryRoot, proposal.target), 'utf8')).frontmatter
        .status,
    ).toBe('proposed');
  });

  it('parses Markdown structure and resolves protected authority', () => {
    const parsed = parseMarkdown(
      'ADR-1.md',
      '---\ntitle: Decision\nstatus: accepted\n---\n# Decision\n\n```ts\nconst x = 1;\n```\n',
    );
    expect(parsed.frontmatter.status).toBe('accepted');
    expect(parsed.headings).toContain('Decision');
    expect(parsed.codeFences[0].closed).toBe(true);
    expect(resolveAuthority('constitution', { id: 'blueprint', path: '/repo', authority: 'architecture' })).toBe(
      'constitutional',
    );
  });

  it('discovers documents and package requirements', () => {
    const root = fixture();
    const inventory = new DocumentationScanner().scan([
      { id: 'fixture', path: root, authority: 'implementation', writable: true },
    ]);
    expect(inventory.documents).toHaveLength(1);
    expect(inventory.findings.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        'packages/sample is missing ARCHITECTURE.md',
        'packages/sample is missing TESTING.md',
        'packages/sample is missing API.md',
        'README is missing required frontmatter: owner',
        'README is missing required section: Public API',
      ]),
    );
  });

  it('plans, proposes, validates, approves, applies, records evidence and emits lifecycle events', async () => {
    const root = fixture();
    const bus = new InProcessEventBus();
    const events: string[] = [];
    bus.subscribe('documentation.*', (event) => {
      events.push(event.type);
    });
    const service = new DocumentationService({
      repositories: [{ id: 'vestara-ai-core', path: root, authority: 'implementation', writable: true }],
      workspaceId: 'fixture',
      eventBus: bus,
    });
    await service.initialize();
    await service.start();
    const inventory = await service.scan();
    expect(inventory.findings.some((item) => item.ruleId === 'relative-links')).toBe(true);
    const plan = await service.createPlan();
    expect(plan.tasks.at(-1)?.dependsOn.length).toBeGreaterThan(0);
    const proposals = await service.runPlan(plan.id, true);
    const architecture = proposals.find((item) => item.documentPath.endsWith('ARCHITECTURE.md'));
    expect(architecture?.status).toBe('proposed');
    expect(fs.existsSync(path.join(root, 'packages/sample/ARCHITECTURE.md'))).toBe(false);
    if (!architecture) throw new Error('expected architecture proposal');
    await service.decideProposal(architecture.id, 'approve', 'reviewer');
    await service.applyProposal(architecture.id, 'reviewer');
    expect(fs.existsSync(path.join(root, 'packages/sample/ARCHITECTURE.md'))).toBe(true);
    const evidence = await service.verify('strict');
    expect(evidence.reportArtifactId).toMatch(/^documentation-report:/);
    expect(events).toEqual(
      expect.arrayContaining([
        'documentation.inventory-completed',
        'documentation.plan-created',
        'documentation.proposal-created',
        'documentation.verification-completed',
      ]),
    );
    await service.dispose();
  });

  it('rejects automatic application of constitutional proposals', async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'VESTARA_CONSTITUTION.md'), '# Constitution\n');
    const service = new DocumentationService({
      repositories: [{ id: 'vestara-ai-core', path: root, authority: 'implementation', writable: true }],
      workspaceId: 'fixture',
    });
    await service.initialize();
    await service.scan();
    const plan = await service.createPlan();
    const proposals = await service.runPlan(plan.id);
    const proposal = proposals.find((item) => item.authority === 'constitutional');
    expect(proposal).toBeDefined();
    if (!proposal) throw new Error('expected constitutional proposal');
    await service.decideProposal(proposal.id, 'approve', 'human');
    await expect(service.applyProposal(proposal.id, 'human')).rejects.toThrow(
      'Constitutional documents cannot be applied',
    );
  });

  it('detects concurrent proposal conflicts', () => {
    const root = fixture();
    const repository = { id: 'fixture', path: root, authority: 'implementation' as const };
    const before = createDocumentEntity(repository, 'packages/sample/README.md', '# Before\n');
    fs.writeFileSync(path.join(root, 'packages/sample/README.md'), '# Changed\n');
    const after = createDocumentEntity(
      repository,
      'packages/sample/README.md',
      fs.readFileSync(path.join(root, 'packages/sample/README.md'), 'utf8'),
    );
    expect(after.checksum).not.toBe(before.checksum);
  });

  it('extracts implementation facts and detects package, route, command, and public API drift', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'packages/sample/src/index.ts'), 'export interface PublicApi { ok: boolean }\n');
    fs.mkdirSync(path.join(root, 'apps', 'api', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'apps/api/src/routes.ts'),
      "if (method === 'GET' && pathname === '/api/real') return true;\n",
    );
    fs.mkdirSync(path.join(root, 'apps', 'cli', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps/cli/src/index.ts'), "registry.register('real', handler);\n");
    fs.writeFileSync(
      path.join(root, 'README.md'),
      '# Drift\n\n@vestara/missing\n\nGET /api/missing\n\n`vestara missing`\n',
    );
    const inventory = new DocumentationScanner().scan([{ id: 'fixture', path: root, authority: 'implementation' }]);
    const rules = new Set(inventory.findings.map((finding) => finding.ruleId));
    expect(rules.has('implementation-package-exists')).toBe(true);
    expect(rules.has('implementation-route-exists')).toBe(true);
    expect(rules.has('implementation-command-exists')).toBe(true);
    expect(rules.has('public-symbol-documented')).toBe(true);
  });

  it('fails a baseline only for newly introduced error findings', async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'packages/sample/missing.md'), '# Existing target\n');
    const service = new DocumentationService({
      repositories: [{ id: 'vestara-ai-core', path: root, authority: 'implementation', writable: true }],
      workspaceId: 'fixture',
    });
    await service.initialize();
    await service.scan();
    const baseline = service.createBaseline();
    expect((await service.checkBaseline(baseline)).passed).toBe(true);
    fs.writeFileSync(path.join(root, 'README.md'), '# New drift\n\n[broken](new-missing.md)\n');
    await service.scan();
    const checked = await service.checkBaseline(baseline);
    expect(checked.passed).toBe(false);
    expect(checked.introduced.some((finding) => finding.ruleId === 'relative-links')).toBe(true);
  });
});
