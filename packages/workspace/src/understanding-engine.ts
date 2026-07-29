/**
 * DefaultUnderstandingEngine — deterministic observation and understanding.
 *
 * Implements the three-phase UnderstandingEngine contract by reading
 * from WorkspaceSession. Every field in WorkspaceObservation is a
 * verifiable fact. Every field in WorkspaceUnderstanding is a
 * deterministic conclusion drawn from those facts.
 *
 * This file lives in the workspace package because it needs access
 * to the session. The understanding package remains pure contracts.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PlanningConstraints,
  PlanningContext,
  RecommendedAction,
  UnderstandingEngine,
  UnderstandingProducer,
  UserRequest,
  WorkspaceObservation,
  WorkspaceUnderstanding,
} from '@vestara/understanding';
import type { DefaultUnderstandingAssembler } from './understanding-assembler.js';
import type { WorkspaceSession } from './workspace-session';

function tryExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 3000 }).trim();
  } catch {
    return null;
  }
}

function tryExecLines(cmd: string, cwd: string): string[] {
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

// ─── Language detection heuristics (shared with RepositoryIntelligence) ──

const SOURCE_WEIGHT: Record<string, number> = {
  ts: 3,
  tsx: 3,
  js: 3,
  jsx: 3,
  py: 3,
  rs: 3,
  go: 3,
  java: 2,
  rb: 2,
  kt: 2,
  swift: 2,
};

export class DefaultUnderstandingEngine implements UnderstandingEngine {
  constructor(private readonly session: WorkspaceSession) {}

  // ── Phase 1: Observe ──────────────────────────────────────────

  async observe(): Promise<WorkspaceObservation> {
    const fp = this.session.fingerprint;
    const profile = this.session.profile;
    const manifest = this.session.manifest;
    const prefs = this.session.prefs;
    const rootPath = this.session.rootPath;

    // Gather memory signals
    let recentMemories: WorkspaceObservation['workspace']['memory']['recentMemories'] = [];
    try {
      const all = await this.session.memory.getContext('workspace', 20);
      recentMemories = all.map((m) => ({
        type: m.type,
        content: m.content,
        importance: m.importance,
        createdAt: m.createdAt,
      }));
    } catch {
      // memory not available
    }

    // Gather conversation signals
    let recentTopics: string[] = [];
    try {
      const convList = await this.session.conversation.listConversations();
      const recent = convList.slice(-5);
      recentTopics = recent.map((c) => c.title).filter(Boolean);
    } catch {
      // conversation not available
    }

    // Gather git activity
    const gitRoot = fp.gitRoot;
    const recentCommits = gitRoot
      ? tryExecLines('git log --oneline -10 --format="%s||%an||%ai"', gitRoot).map((line) => {
          const parts = line.split('||');
          return {
            message: parts[0] ?? line,
            author: parts[1] ?? '',
            timestamp: parts[2] ?? '',
          };
        })
      : [];

    const activeBranches = gitRoot
      ? tryExecLines('git branch --format="%(refname:short)"', gitRoot).filter((b) => b !== fp.gitBranch)
      : [];

    const uncommittedChanges = gitRoot ? Number(tryExec('git status --porcelain | wc -l', gitRoot) ?? '0') : 0;

    const filesChangedSinceOpen = manifest.files?.mtimeCache
      ? WorkspaceManifest.detectChangedFiles(this.discoverMtimeCache(rootPath), manifest.files.mtimeCache)
      : [];

    return {
      timestamp: new Date().toISOString(),

      identity: {
        name: fp.name,
        id: fp.id,
        canonicalPath: fp.canonicalPath,
        git: {
          root: fp.gitRoot,
          branch: fp.gitBranch,
          commit: fp.gitCommit,
          remote: fp.gitRemote,
        },
        repositoryHash: fp.repositoryHash,
      },

      files: {
        totalCount: manifest.files?.count ?? profile.fileCount,
        totalSizeKB: manifest.files?.totalSizeKB ?? profile.totalSizeKB,
        byExtension: manifest.files?.byExtension ?? {},
        configFilesPresent: this.detectConfigFiles(rootPath),
      },

      languageSignals: this.computeLanguageSignals(manifest.files?.byExtension ?? {}),

      dependencies: {
        packages: (profile.packages ?? []).map((p) => ({
          name: p.name,
          path: p.path,
          dependencies: p.dependencies,
          devDependencies: p.devDependencies,
          isPrivate: p.isPrivate,
        })),
        totalDependencies: profile.dependencyCount,
        totalDevDependencies: 0,
      },

      config: {
        hasPackageJson: fs.existsSync(path.join(rootPath, 'package.json')),
        hasTsconfig: fs.existsSync(path.join(rootPath, 'tsconfig.json')),
        hasDocker: profile.hasDocker,
        hasCI: profile.hasCI,
        isMonorepo: profile.isMonorepo,
        detectedPackageManager: profile.packageManager ?? null,
        detectedBuildTool: profile.buildTool ?? null,
        detectedTestFramework: profile.testFramework ?? null,
      },

      entryPoints: profile.entryPoints.map((ep) => ({
        path: ep.path,
        type: ep.type,
        source: ep.source,
      })),

      health: {
        overall: profile.healthScore?.overall ?? 0,
        codeQuality: profile.healthScore?.categories.codeQuality ?? 0,
        testCoverage: profile.healthScore?.categories.testCoverage ?? 0,
        dependencyHealth: profile.healthScore?.categories.dependencyHealth ?? 0,
        documentation: profile.healthScore?.categories.documentation ?? 0,
        risks: profile.risks.map((r) => ({
          category: r.category,
          severity: r.severity,
          location: r.location,
          detail: r.detail,
        })),
      },

      gitActivity: {
        recentCommits,
        activeBranches,
        uncommittedChanges,
        filesChangedSinceOpen,
      },

      workspace: {
        status: 'ready',
        lastOpenedAt: manifest.lastOpenedAt ?? null,
        knowledge: {
          documentsIndexed: manifest.knowledge?.documents ?? 0,
          chunksCreated: manifest.knowledge?.chunks ?? 0,
          lastIndexedAt: manifest.knowledge?.lastIndexedAt ?? null,
        },
        memory: {
          totalCount: manifest.memory?.count ?? recentMemories.length,
          lastConsolidatedAt: manifest.memory?.lastConsolidatedAt ?? null,
          recentMemories,
        },
        preferences: {
          activeProvider: prefs.get?.('provider') ?? null,
          activeModel: prefs.get?.('model') ?? null,
          autoIndexEnabled: (prefs.get?.('autoIndex') ?? 'true') === 'true',
        },
        conversations: {
          totalConversations: recentTopics.length,
          recentTopics,
        },
      },
    };
  }

  // ── Phase 2: Understand (delegates to producers + assembler) ──

  private producers: UnderstandingProducer[] | null = null;
  private assembler: DefaultUnderstandingAssembler | null = null;

  async understand(observation: WorkspaceObservation): Promise<WorkspaceUnderstanding> {
    if (!this.producers) {
      const { createDefaultProducers } = await import('./producers/index.js');
      this.producers = createDefaultProducers();
    }
    if (!this.assembler) {
      const { DefaultUnderstandingAssembler } = await import('./understanding-assembler.js');
      this.assembler = new DefaultUnderstandingAssembler();
    }
    return this.assembler.assemble(observation, this.producers);
  }

  // ── Phase 3: Plan ─────────────────────────────────────────────

  async plan(
    request: UserRequest,
    understanding: WorkspaceUnderstanding,
    constraints?: PlanningConstraints,
  ): Promise<PlanningContext> {
    const recommendations = this.generateRecommendations(request, understanding);

    return {
      request,
      understanding,
      intent: {
        kind: 'unknown',
        confidence: 0,
        scope: [],
      },
      constraints: constraints ?? {
        requireApproval: true,
      },
      recommendations,
    };
  }

  // ── Private helpers ────────────────────────────────────────────

  private detectConfigFiles(rootPath: string): string[] {
    const candidates = [
      'package.json',
      'tsconfig.json',
      'docker-compose.yml',
      'Dockerfile',
      '.github/workflows',
      '.gitlab-ci.yml',
      'Makefile',
      'Dockerfile',
      'pnpm-workspace.yaml',
      'lerna.json',
      'nx.json',
      'turbo.json',
      'vitest.config.ts',
      'jest.config.ts',
      '.eslintrc.js',
      '.prettierrc',
      'biome.json',
      'go.mod',
      'Cargo.toml',
      'Gemfile',
      'setup.py',
    ];
    const found: string[] = [];
    for (const name of candidates) {
      try {
        const fullPath = path.join(rootPath, name);
        if (fs.existsSync(fullPath)) {
          found.push(name);
        }
      } catch {
        // skip
      }
    }
    return found;
  }

  private computeLanguageSignals(byExtension: Record<string, number>): WorkspaceObservation['languageSignals'] {
    return Object.entries(byExtension).map(([ext, count]) => ({
      extension: ext,
      fileCount: count,
      weight: SOURCE_WEIGHT[ext] ?? 1,
    }));
  }

  private generateRecommendations(
    request: UserRequest,
    _understanding: WorkspaceUnderstanding,
  ): readonly RecommendedAction[] {
    const recommendations: RecommendedAction[] = [];

    if (request.text) {
      recommendations.push({
        description: `Analyze request: "${request.text.slice(0, 100)}" against current workspace state`,
        confidence: 1,
        rationale: 'User request requires workspace-aware planning',
        understandingSource: 'identity',
      });
    }

    return recommendations as readonly RecommendedAction[];
  }

  private discoverMtimeCache(rootPath: string): Record<string, string> {
    const cache: Record<string, string> = {};
    try {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
            walk(fullPath);
          } else {
            try {
              const stat = fs.statSync(fullPath);
              cache[fullPath] = stat.mtimeMs.toString();
            } catch {
              // skip
            }
          }
        }
      };
      walk(rootPath);
    } catch {
      // walk failed
    }
    return cache;
  }
}

// Import at bottom to resolve circular dependency with WorkspaceManifest
import { WorkspaceManifest } from './workspace-manifest';
