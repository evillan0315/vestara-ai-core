import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InProcessEventBus } from '@vestara/event-bus';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDocumentEntity,
  DocumentationScanner,
  DocumentationService,
  parseMarkdown,
  resolveAuthority,
} from '../src/index.js';

const roots: string[] = [];
function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-docs-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'packages', 'sample', 'src'), { recursive: true });
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
      expect.arrayContaining(['packages/sample is missing ARCHITECTURE.md', 'packages/sample is missing TESTING.md']),
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
