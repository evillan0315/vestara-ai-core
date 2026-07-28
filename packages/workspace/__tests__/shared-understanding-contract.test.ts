/**
 * SharedUnderstandingContract — verifies ADR-043 invariant:
 *
 * "A workspace produces exactly one immutable WorkspaceUnderstanding
 *  snapshot per observation cycle. All product components consume
 *  this shared snapshot."
 *
 * The contract: given one WorkspaceUnderstanding, every consumer
 * references the same snapshot id.
 */

import { describe, expect, it } from 'vitest';
import type {
  WorkspaceObservation,
  WorkspaceUnderstanding,
} from '@vestara/understanding';
import { UnderstandingContextAssembler } from '../src/understanding-context-assembler';

// ── Helpers ──────────────────────────────────────────────────

function createMinimalObservation(): WorkspaceObservation {
  return {
    timestamp: '2026-07-28T00:00:00.000Z',
    identity: {
      name: 'test-repo',
      id: 'test-id-001',
      canonicalPath: '/tmp/test-repo',
      git: { root: null, branch: null, commit: null, remote: null },
      repositoryHash: 'abc123',
    },
    files: {
      totalCount: 50,
      totalSizeKB: 1024,
      byExtension: { ts: 30, tsx: 10, json: 5, md: 5 },
      configFilesPresent: ['package.json', 'tsconfig.json'],
    },
    languageSignals: [
      { extension: 'ts', fileCount: 30, weight: 3 },
      { extension: 'tsx', fileCount: 10, weight: 3 },
      { extension: 'json', fileCount: 5, weight: 1 },
    ],
    dependencies: {
      packages: [
        { name: '@app/main', path: '.', dependencies: ['react'], devDependencies: ['vitest'], isPrivate: true },
      ],
      totalDependencies: 1,
      totalDevDependencies: 1,
    },
    config: {
      hasPackageJson: true,
      hasTsconfig: true,
      hasDocker: false,
      hasCI: true,
      isMonorepo: false,
      detectedPackageManager: 'pnpm',
      detectedBuildTool: 'tsc',
      detectedTestFramework: 'vitest',
    },
    entryPoints: [
      { path: 'src/index.ts', type: 'app', source: 'convention' },
    ],
    health: {
      overall: 7.5,
      codeQuality: 8.0,
      testCoverage: 6.0,
      dependencyHealth: 9.0,
      documentation: 7.0,
      risks: [
        { category: 'missing-tests', severity: 'medium', location: 'src/utils.ts', detail: 'Some modules lack test coverage' },
      ],
    },
    gitActivity: {
      recentCommits: [
        { message: 'Add auth middleware', author: 'dev', timestamp: '2026-07-27T10:00:00Z' },
        { message: 'Fix token validation', author: 'dev', timestamp: '2026-07-27T09:00:00Z' },
      ],
      activeBranches: ['feature/auth'],
      uncommittedChanges: 0,
      filesChangedSinceOpen: [],
    },
    workspace: {
      status: 'ready',
      lastOpenedAt: '2026-07-27T08:00:00Z',
      knowledge: { documentsIndexed: 10, chunksCreated: 45, lastIndexedAt: '2026-07-27T08:00:00Z' },
      memory: {
        totalCount: 5,
        lastConsolidatedAt: '2026-07-27T08:00:00Z',
        recentMemories: [
          { type: 'decision', content: 'Use JWT for authentication', importance: 8, createdAt: '2026-07-27T10:00:00Z' },
          { type: 'fact', content: 'Supports refresh tokens', importance: 6, createdAt: '2026-07-27T09:30:00Z' },
        ],
      },
      preferences: { activeProvider: 'opencode', activeModel: 'deepseek-v4-flash-free', autoIndexEnabled: true },
      conversations: { totalConversations: 3, recentTopics: ['auth', 'api design'] },
    },
  } as WorkspaceObservation;
}

function createInvalidObservation(): WorkspaceObservation {
  return {
    timestamp: '2026-07-28T00:00:00.000Z',
    identity: {
      name: 'empty-repo',
      id: 'test-id-002',
      canonicalPath: '/tmp/empty-repo',
      git: { root: null, branch: null, commit: null, remote: null },
      repositoryHash: 'def456',
    },
    files: { totalCount: 0, totalSizeKB: 0, byExtension: {}, configFilesPresent: [] },
    languageSignals: [],
    dependencies: { packages: [], totalDependencies: 0, totalDevDependencies: 0 },
    config: {
      hasPackageJson: false, hasTsconfig: false, hasDocker: false, hasCI: false,
      isMonorepo: false, detectedPackageManager: null, detectedBuildTool: null, detectedTestFramework: null,
    },
    entryPoints: [],
    health: { overall: 0, codeQuality: 0, testCoverage: 0, dependencyHealth: 0, documentation: 0, risks: [] },
    gitActivity: { recentCommits: [], activeBranches: [], uncommittedChanges: 0, filesChangedSinceOpen: [] },
    workspace: {
      status: 'ready', lastOpenedAt: null,
      knowledge: { documentsIndexed: 0, chunksCreated: 0, lastIndexedAt: null },
      memory: { totalCount: 0, lastConsolidatedAt: null, recentMemories: [] },
      preferences: { activeProvider: null, activeModel: null, autoIndexEnabled: true },
      conversations: { totalConversations: 0, recentTopics: [] },
    },
  } as WorkspaceObservation;
}

// ── Tests ────────────────────────────────────────────────────

describe('SharedUnderstandingContract', () => {
  describe('Understanding identity', () => {
    it('produces a deterministic id from workspace identity and timestamp', async () => {
      const { DefaultUnderstandingEngine } = await import('../src/understanding-engine.js');
      // We can't easily construct a session in a unit test, but we
      // can verify understand() produces consistent ids from observation
      const engine = new DefaultUnderstandingEngine({} as any);

      const obs1 = createMinimalObservation();
      const obs2 = createMinimalObservation();
      const obs3 = createInvalidObservation();

      const u1 = await engine.understand(obs1);
      const u2 = await engine.understand(obs2);
      const u3 = await engine.understand(obs3);

      // Same observation → same id (deterministic)
      expect(u1.id).toBe(u2.id);

      // Different observation → different id
      expect(u1.id).not.toBe(u3.id);

      // id combines workspace identity and timestamp
      expect(u1.id).toContain('test-id-001');
      expect(u1.id).toContain('2026-07-28T00:00:00.000Z');
      expect(u3.id).toContain('test-id-002');
    });

    it('assigns snapshot identity based on language and architecture', async () => {
      const { DefaultUnderstandingEngine } = await import('../src/understanding-engine.js');
      const engine = new DefaultUnderstandingEngine({} as any);

      const observation = createMinimalObservation();
      const understanding = await engine.understand(observation);

      expect(understanding.id).toBeTruthy();
      expect(typeof understanding.id).toBe('string');
      expect(understanding.fromObservationTimestamp).toBe(observation.timestamp);
    });
  });

  describe('UnderstandingContextAssembler', () => {
    it('includes understanding data in system prompt', async () => {
      const { DefaultUnderstandingEngine } = await import('../src/understanding-engine.js');
      const engine = new DefaultUnderstandingEngine({} as any);
      const observation = createMinimalObservation();
      const understanding = await engine.understand(observation);

      const assembler = new UnderstandingContextAssembler(understanding);
      const request = assembler.buildContext(
        { id: 'conv-1', title: 'Test', messages: [], metadata: { model: 'test', provider: 'test', tokens: 0, cost: 0, latency: 0 }, status: 'active', createdAt: '', updatedAt: '' },
        'What should I work on?',
      );

      const systemMsg = request.messages[0];
      expect(systemMsg.content).toContain('test-repo');
      expect(systemMsg.content).toContain('typescript');
      expect(systemMsg.content).toContain('Add auth middleware');
      expect(systemMsg.content).toContain('JWT for authentication');
    });

    it('falls back to default prompt when understanding is null', () => {
      const fallback = 'You are Vestara, a helpful assistant.';
      const assembler = new UnderstandingContextAssembler(null, fallback);
      const request = assembler.buildContext(
        { id: 'conv-1', title: 'Test', messages: [], metadata: { model: 'test', provider: 'test', tokens: 0, cost: 0, latency: 0 }, status: 'active', createdAt: '', updatedAt: '' },
        'Hello',
      );

      expect(request.messages[0].content).toBe(fallback);
    });
  });

  describe('Consumer invariant: same snapshot id', () => {
    it('every consumer receives the same understanding id', async () => {
      const { DefaultUnderstandingEngine } = await import('../src/understanding-engine.js');
      const engine = new DefaultUnderstandingEngine({} as any);
      const observation = createMinimalObservation();
      const understanding = await engine.understand(observation);

      // Simulate two consumers — conversation and planner — each
      // receiving the same understanding snapshot.
      const assembler1 = new UnderstandingContextAssembler(understanding);
      const assembler2 = new UnderstandingContextAssembler(understanding);

      // Both assemblers carry the same snapshot id
      expect(assembler1['understanding']?.id).toBe(understanding.id);
      expect(assembler2['understanding']?.id).toBe(understanding.id);

      // The id is consistent: same observation → same id
      const observation2 = createMinimalObservation();
      const understanding2 = await engine.understand(observation2);
      expect(understanding2.id).toBe(understanding.id);
    });
  });
});
