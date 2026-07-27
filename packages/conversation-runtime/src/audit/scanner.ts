/**
 * ConversationScanner — Scans conversation-related packages for health,
 * coverage, latency, and architecture compliance.
 *
 * Used by the Conversation Developer agent and CLI audit command to
 * produce structured reports about the conversation feature's state.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ConversationPackage {
  name: string;
  path: string;
  exists: boolean;
  hasSrc: boolean;
  hasTests: boolean;
  hasDist: boolean;
  sourceFiles: number;
  testFiles: number;
  totalLines: number;
}

export interface ConversationAuditReport {
  timestamp: string;
  rootPath: string;
  packages: ConversationPackage[];
  summary: {
    total: number;
    present: number;
    withTests: number;
    withDist: number;
    totalSourceLines: number;
    totalTestLines: number;
  };
  issues: AuditIssue[];
  recommendations: string[];
  latency: {
    v4Targets: Record<string, { target: number; status: string }>;
  };
}

export interface AuditIssue {
  severity: 'error' | 'warning' | 'info';
  package: string;
  message: string;
  detail?: string;
}

const CONVERSATION_PACKAGES = [
  'packages/conversation',
  'packages/conversation-runtime',
  'packages/audio',
  'packages/stt',
  'packages/tts',
  'packages/activity-log',
  'packages/events',
  'packages/event-bus',
  'packages/stream',
  'packages/context',
  'packages/providers/opencode',
  'apps/onboarding-lab',
];

const LATENCY_TARGETS: Record<string, number> = {
  'Audio capture': 10,
  VAD: 20,
  STT: 300,
  'Conversation (LLM)': 700,
  TTS: 150,
  'End-to-end': 1500,
};

export class ConversationScanner {
  private rootPath: string;

  constructor(rootPath?: string) {
    this.rootPath = rootPath || process.cwd();
  }

  scan(): ConversationAuditReport {
    const packages: ConversationPackage[] = [];
    const issues: AuditIssue[] = [];

    for (const relPath of CONVERSATION_PACKAGES) {
      const pkgPath = path.join(this.rootPath, relPath);
      const pkg = this._scanPackage(relPath, pkgPath);
      packages.push(pkg);
    }

    // Detect issues
    for (const pkg of packages) {
      if (!pkg.exists) {
        issues.push({ severity: 'error', package: pkg.name, message: 'Package directory missing', detail: pkg.path });
      } else if (!pkg.hasDist) {
        issues.push({
          severity: 'warning',
          package: pkg.name,
          message: 'No compiled output (dist/)',
          detail: 'Run pnpm build',
        });
      } else if (!pkg.hasTests) {
        issues.push({
          severity: 'warning',
          package: pkg.name,
          message: 'No test files found',
          detail: 'Add __tests__/ directory with .test.ts files',
        });
      }
    }

    // Check for .vestara/ directory
    const vestaraDir = path.join(this.rootPath, '.vestara');
    if (!fs.existsSync(vestaraDir)) {
      issues.push({
        severity: 'info',
        package: 'workspace',
        message: 'No .vestara/ directory',
        detail: 'Run vestara open . to initialize workspace',
      });
    }

    const recommendations = this._generateRecommendations(packages, issues);

    const summary = {
      total: packages.length,
      present: packages.filter((p) => p.exists).length,
      withTests: packages.filter((p) => p.hasTests).length,
      withDist: packages.filter((p) => p.hasDist).length,
      totalSourceLines: packages.reduce((s, p) => s + p.totalLines, 0),
      totalTestLines: 0,
    };

    const latencyTargets: Record<string, { target: number; status: string }> = {};
    for (const [stage, target] of Object.entries(LATENCY_TARGETS)) {
      latencyTargets[stage] = { target, status: 'pending' };
    }

    return {
      timestamp: new Date().toISOString(),
      rootPath: this.rootPath,
      packages,
      summary,
      issues,
      recommendations,
      latency: { v4Targets: latencyTargets },
    };
  }

  private _scanPackage(relPath: string, pkgPath: string): ConversationPackage {
    const exists = fs.existsSync(pkgPath);
    if (!exists) {
      return {
        name: relPath.replace('packages/', '').replace('providers/', '').replace('apps/', ''),
        path: pkgPath,
        exists: false,
        hasSrc: false,
        hasTests: false,
        hasDist: false,
        sourceFiles: 0,
        testFiles: 0,
        totalLines: 0,
      };
    }

    const srcDir = path.join(pkgPath, 'src');
    const testDir = path.join(pkgPath, '__tests__');
    const distDir = path.join(pkgPath, 'dist');

    const hasSrc = fs.existsSync(srcDir);
    const hasTests = fs.existsSync(testDir);
    const hasDist = fs.existsSync(distDir);

    const sourceFiles = hasSrc ? this._countFiles(srcDir, '.ts') : 0;
    const testFiles = hasTests ? this._countFiles(testDir, '.test.ts') : 0;
    const totalLines = hasSrc ? this._countLines(srcDir) : 0;

    return {
      name: relPath.replace('packages/', '').replace('providers/', '').replace('apps/', ''),
      path: pkgPath,
      exists: true,
      hasSrc,
      hasTests,
      hasDist,
      sourceFiles,
      testFiles,
      totalLines,
    };
  }

  private _countFiles(dir: string, ext: string): number {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let count = 0;
      for (const e of entries) {
        if (e.isDirectory()) count += this._countFiles(path.join(dir, e.name), ext);
        else if (e.name.endsWith(ext)) count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  private _countLines(dir: string): number {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let lines = 0;
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) lines += this._countLines(full);
        else if (e.name.endsWith('.ts')) {
          try {
            const content = fs.readFileSync(full, 'utf-8');
            lines += content.split('\n').length;
          } catch {}
        }
      }
      return lines;
    } catch {
      return 0;
    }
  }

  private _generateRecommendations(packages: ConversationPackage[], issues: AuditIssue[]): string[] {
    const recs: string[] = [];
    const missingDist = packages.filter((p) => p.exists && !p.hasDist);
    if (missingDist.length > 0) {
      recs.push(`Build required: ${missingDist.map((p) => p.name).join(', ')} are missing dist/`);
    }
    const missingTests = packages.filter((p) => p.exists && !p.hasTests);
    if (missingTests.length > 0) {
      recs.push(`Tests needed: Add test files for ${missingTests.map((p) => p.name).join(', ')}`);
    }
    const noIssues = issues.filter((i) => i.severity === 'error');
    if (noIssues.length > 0) {
      recs.push(`Fix ${noIssues.length} error(s) before deploying conversation features`);
    }
    recs.push('Verify end-to-end: run `pnpm vestara demo golden-path`');
    recs.push('Check audio: run `pnpm vestara doctor audio`');
    recs.push('Check providers: run `pnpm vestara doctor conversation`');
    return recs;
  }
}
