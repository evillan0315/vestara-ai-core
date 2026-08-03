/**
 * @vestara/tools-project — Project analysis tool
 *
 * Walks the workspace and detects repository structure (type, language,
 * framework, package manager, monorepo shape) through
 * DefaultRepositoryAnalyzer. Low risk (read-only filesystem scan). Integrates
 * with the ToolRuntime for permission-gated execution.
 *
 * Architecture Traceability:
 *   Foundation: TOOL-CATALOG.md → T-00x project
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DefaultRepositoryAnalyzer, type RepositoryAnalyzer } from '@vestara/knowledge';
import type { ToolExecutionContext, ToolExecutionResult, ToolInputSchema, VestaraTool } from '@vestara/tool-runtime';
import type { EvidenceArtifact } from '@vestara/types';

export const version = '0.1.0';

export interface ProjectAnalyzeInput {
  readonly rootDir: string;
}

export interface ProjectAnalyzeOutput {
  readonly type: string;
  readonly language: string;
  readonly framework?: string;
  readonly packageManager?: string;
  readonly isMonorepo: boolean;
  readonly fileCount: number;
  readonly hasDocker: boolean;
  readonly hasCI: boolean;
}

function recordInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object');
  return input as Record<string, unknown>;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Tool input requires non-empty string: ${key}`);
  return value;
}

function projectEvidence(summary: string): EvidenceArtifact {
  return {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'file',
    summary,
    metadata: { operation: 'project.analyze' },
  };
}

const MAX_FILES = 20_000;

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string, relative: string): void => {
    if (files.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        visit(path.join(dir, entry.name), childRelative);
      } else if (entry.isFile()) {
        files.push(childRelative);
      }
    }
  };
  visit(root, '');
  return files;
}

/** Detect the structure of the active workspace (low risk, read-only scan). */
export class ProjectAnalyzeTool implements VestaraTool<ProjectAnalyzeInput, ProjectAnalyzeOutput> {
  readonly name = 'project.analyze';
  readonly description = 'Detect the repository structure: type, language, framework, tooling, and monorepo shape';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<ProjectAnalyzeInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', minLength: 1 },
      },
      required: ['rootDir'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      return { rootDir: requiredString(record, 'rootDir') };
    },
  };

  constructor(private readonly analyzer: RepositoryAnalyzer = new DefaultRepositoryAnalyzer()) {}

  affectedResources(input: ProjectAnalyzeInput): readonly string[] {
    return [input.rootDir];
  }

  async execute(
    input: ProjectAnalyzeInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ProjectAnalyzeOutput>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      if (!fs.existsSync(input.rootDir)) {
        return { status: 'failed', error: `Directory does not exist: ${input.rootDir}`, evidence: [] };
      }
      const files = walkFiles(input.rootDir);
      const info = this.analyzer.analyze(files);
      return {
        status: 'completed',
        output: {
          type: info.type,
          language: info.language,
          framework: info.framework,
          packageManager: info.packageManager,
          isMonorepo: info.isMonorepo,
          fileCount: info.fileCount,
          hasDocker: info.hasDocker,
          hasCI: info.hasCI,
        },
        evidence: [projectEvidence(`Analyzed project "${path.basename(input.rootDir)}" (${files.length} files)`)],
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        evidence: [],
      };
    }
  }
}
