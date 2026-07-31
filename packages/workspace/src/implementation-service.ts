/**
 * ImplementationService — Transforms an approved Plan into a Change Set.
 *
 * For each task in the plan:
 *   1. Read current file content
 *   2. Generate proposed changes (AI-synthesized or deterministic)
 *   3. Create a FileChange record
 *
 * The Change Set is a first-class execution artifact. Changes are not
 * written to disk until the user explicitly runs `vestara implement apply`.
 *
 * Architecture Traceability:
 *   PCS: PCS-004 — Implementation
 *   Product Principle: Evolve Intelligence Before Autonomy
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AIProvider } from '@vestara/shared';
import type { AgentCapabilityManager } from './agent-capability-manager';
import type { ChangeSetStorage } from './change-set-storage';
import type { DecisionStorage } from './decision-storage';
import type { PlanStorage } from './plan-storage';
import type { ChangeSet, FileChange, Plan, Task } from './types';
import type { WorkspaceSession } from './workspace-session';

export interface ImplementResult {
  changeSet: ChangeSet;
  plan: Plan;
  source: 'ai' | 'deterministic';
  duration: number;
}

export class ImplementationService {
  private planStorage: PlanStorage;
  private csStorage: ChangeSetStorage;
  private decisionStorage?: DecisionStorage;
  private provider?: AIProvider;
  private capabilities?: AgentCapabilityManager;

  constructor(opts: {
    planStorage: PlanStorage;
    csStorage: ChangeSetStorage;
    decisionStorage?: DecisionStorage;
    provider?: AIProvider;
    capabilities?: AgentCapabilityManager;
  }) {
    this.planStorage = opts.planStorage;
    this.csStorage = opts.csStorage;
    this.decisionStorage = opts.decisionStorage;
    this.provider = opts.provider;
    this.capabilities = opts.capabilities;
  }

  /**
   * Generate a Change Set from an approved Plan.
   * Reads current files, generates proposed changes, creates a Change Set artifact.
   */
  async implement(planId: string, session: WorkspaceSession): Promise<ImplementResult> {
    const startTime = performance.now();
    const rootDir = session.rootPath;

    // Load the plan
    const plan = await this.planStorage.get(planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);
    if (plan.status !== 'approved') {
      throw new Error(`Plan "${planId}" status is "${plan.status}". Only approved plans can be implemented.`);
    }

    // Create Change Set skeleton
    const cs = await this.csStorage.create(planId, plan.title, session.fingerprint.id);

    // Collect all files that need changing
    const allFiles = new Set<string>();
    for (const task of plan.tasks) {
      for (const f of task.files) {
        if (f && f !== '.' && f !== '') {
          allFiles.add(f);
        }
      }
    }
    // If no valid file paths, use scope from plan
    if (allFiles.size === 0) {
      for (const scope of plan.scope) {
        if (scope && scope !== '.' && scope !== '') {
          allFiles.add(scope);
        }
      }
    }

    // Read current content for each file
    const fileContents = new Map<string, string>();
    for (const filePath of allFiles) {
      try {
        const fullPath = path.resolve(rootDir, filePath);
        if (fs.statSync(fullPath).isDirectory()) continue; // skip directories
        const content = fs.readFileSync(fullPath, 'utf-8');
        fileContents.set(filePath, content);
      } catch {
        fileContents.set(filePath, ''); // new file
      }
    }

    // Generate file changes per task
    const fileChanges: FileChange[] = [];

    for (const task of plan.tasks) {
      const taskFiles = task.files.length > 0 ? task.files : Array.from(allFiles).slice(0, 1);
      for (const filePath of taskFiles) {
        const currentContent = fileContents.get(filePath) ?? '';

        // Try AI generation
        let proposedContent: string | null = null;
        if (this.provider) {
          proposedContent = await this.generateWithAI(task, filePath, currentContent, rootDir, plan);
        }

        // Fallback to deterministic placeholder
        if (!proposedContent) {
          proposedContent = this.generateDeterministic(task, filePath, currentContent);
        }

        const change: FileChange = {
          path: filePath,
          originalContent: currentContent,
          proposedContent,
          status: 'pending',
          taskId: task.id,
        };
        fileChanges.push(change);
      }
    }

    // Update Change Set with file changes
    cs.files = fileChanges;
    cs.status = 'draft';
    await this.csStorage.save(cs);

    const source: 'ai' | 'deterministic' = fileChanges.some((f) => f.proposedContent !== f.originalContent)
      ? this.provider
        ? 'ai'
        : 'deterministic'
      : 'deterministic';

    // Generate execution summary
    const packagesAffected = new Set<string>();
    for (const fc of fileChanges) {
      const parts = fc.path.split('/');
      if (parts.length >= 2) packagesAffected.add(`${parts[0]}/${parts[1]}`);
    }

    const healthScore = session.profile.healthScore;
    cs.summary = {
      filesModified: cs.files.length,
      packagesModified: packagesAffected.size,
      testsAffected: cs.files.filter((f) => f.path.includes('test') || f.path.includes('__tests__')).length,
      risk: cs.files.length > 10 ? 'high' : cs.files.length > 5 ? 'medium' : 'low',
      healthDelta: healthScore ? Math.round((1 - cs.files.length * 0.02) * 10) / 10 : 0,
      executionDuration: Math.round(performance.now() - startTime),
    };
    await this.csStorage.save(cs);

    return {
      changeSet: cs,
      plan,
      source,
      duration: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Implement from a decision — loads the linked plan and creates a fully traceable ChangeSet.
   */
  async implementFromDecision(decisionId: string, session: WorkspaceSession): Promise<ImplementResult> {
    if (!this.decisionStorage) throw new Error('DecisionStorage required');
    const decision = await this.decisionStorage.get(decisionId);
    if (!decision) throw new Error(`Decision "${decisionId}" not found.`);
    if (!decision.accepted) throw new Error(`Decision "${decisionId}" has not been accepted.`);

    const planId = decision.planId;
    if (!planId) throw new Error(`Decision "${decisionId}" has no linked plan.`);

    const result = await this.implement(planId, session);
    result.changeSet.decisionId = decisionId;
    result.changeSet.assessmentId = decision.assessmentId;
    await this.csStorage.save(result.changeSet);
    return result;
  }

  /**
   * Apply a Change Set — writes all proposed changes to disk.
   */
  async apply(csId: string, session: WorkspaceSession): Promise<ChangeSet> {
    const cs = await this.csStorage.get(csId);
    if (!cs) throw new Error(`Change Set "${csId}" not found.`);
    if (cs.status === 'applied') throw new Error(`Change Set "${csId}" is already applied.`);

    const rootDir = session.rootPath;
    let allApplied = true;

    for (const fileChange of cs.files) {
      try {
        if (this.capabilities) {
          // Route through the FilesystemRuntime capability boundary — workspace
          // sandbox, approval gates, dry-run, and operation logging apply.
          const result = await this.capabilities.executeAsTool('filesystem.write', {
            path: fileChange.path,
            content: fileChange.proposedContent,
            reason: `Apply change set ${cs.id}`,
          });
          if (!result.ok) throw new Error(result.error || 'Write failed');
        } else {
          const fullPath = path.resolve(rootDir, fileChange.path);
          const dir = path.dirname(fullPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, fileChange.proposedContent, 'utf-8');
        }
        fileChange.status = 'applied';
      } catch (error) {
        fileChange.status = 'conflict';
        fileChange.proposedContent += `\n// ERROR: ${(error as Error).message}`;
        allApplied = false;
      }
    }

    cs.status = allApplied ? 'applied' : 'partial';
    cs.appliedAt = new Date().toISOString();
    await this.csStorage.save(cs);

    // Update plan status
    const plan = await this.planStorage.get(cs.planId);
    if (plan) {
      plan.status = allApplied ? 'executing' : 'approved';
      plan.updatedAt = new Date().toISOString();
      await this.planStorage.save(plan);
    }

    return cs;
  }

  /**
   * Get a Change Set by ID.
   */
  async getChangeSet(id: string): Promise<ChangeSet | null> {
    return this.csStorage.get(id);
  }

  /**
   * List Change Sets by plan.
   */
  async listChangeSets(planId: string): Promise<ChangeSet[]> {
    return this.csStorage.listByPlan(planId);
  }

  /**
   * AI tier: Generate proposed content for a task's file change.
   */
  private async generateWithAI(
    task: Task,
    filePath: string,
    currentContent: string,
    _rootDir: string,
    plan: Plan,
  ): Promise<string | null> {
    const prompt = `You are Vestara's Implementation Engine. Given a task and a file, generate the proposed new content.

Task: ${task.summary}
Description: ${task.description}
File: ${filePath}
Plan Goal: ${plan.goal}

Current file content:
\`\`\`
${currentContent.slice(0, 3000)}
\`\`\`

${
  currentContent.length > 0
    ? 'Produce the complete new file content that satisfies the task. ' +
      'Make minimal changes — only modify what the task requires. ' +
      'Preserve all existing code structure, imports, and formatting. ' +
      'Return ONLY the file content, no explanation.'
    : 'This is a new file. Produce the complete file content. ' + 'Return ONLY the file content, no explanation.'
}`;

    try {
      const response = await this.provider!.complete({
        model: 'deepseek-v4-flash-free',
        messages: [
          {
            role: 'system',
            content:
              "You are Vestara's Implementation Engine. Generate file content based on task descriptions. Return only file content, no explanation.",
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 4096,
      });
      return response.content || null;
    } catch {
      return null;
    }
  }

  /**
   * Deterministic tier: Generate a placeholder with guidance for the developer.
   */
  private generateDeterministic(task: Task, filePath: string, _currentContent: string): string {
    const ext = path.extname(filePath);
    const comment =
      ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx'
        ? '//'
        : ext === '.py'
          ? '#'
          : ext === '.rs'
            ? '//'
            : ext === '.go'
              ? '//'
              : '//';

    const lines: string[] = [];

    if (_currentContent.length === 0) {
      lines.push(`${comment} File: ${filePath}`);
      lines.push(`${comment} Task: ${task.summary}`);
      lines.push(`${comment} Goal: Implement per Plan ${task.id}`);
      lines.push('');
      lines.push(`${comment} TODO: Implement per task description:`);
      lines.push(`${comment} ${task.description}`);
      lines.push('');
    } else {
      lines.push(`\n${comment} === CHANGE: ${task.summary} ===`);
      lines.push(`${comment} Task ID: ${task.id}`);
      lines.push(`${comment} ${task.description}`);
    }

    return _currentContent.length > 0 ? `${_currentContent}\n${lines.join('\n')}` : lines.join('\n');
  }

  /**
   * Render a Change Set for terminal display.
   */
  renderChangeSet(cs: ChangeSet): string {
    const lines: string[] = [];
    lines.push(`Change Set ${cs.id}`);
    lines.push(`──────────────────────────────────────`);
    lines.push(`Plan: ${cs.planId}`);
    if (cs.assessmentId) lines.push(`Assessment: ${cs.assessmentId}`);
    if (cs.decisionId) lines.push(`Decision: ${cs.decisionId}`);
    if (cs.author) lines.push(`Author: ${cs.author}`);
    lines.push(`Status: ${cs.status}`);
    lines.push(`Created: ${cs.createdAt}`);
    if (cs.appliedAt) lines.push(`Applied: ${cs.appliedAt}`);
    lines.push('');

    if (cs.files.length === 0) {
      lines.push('No file changes.');
      return lines.join('\n');
    }

    let totalInsertions = 0;
    let totalDeletions = 0;

    lines.push('Files:');
    for (const fc of cs.files) {
      const origLines = fc.originalContent.split('\n').length;
      const newLines = fc.proposedContent.split('\n').length;
      const insertions = fc.originalContent === '' ? newLines : Math.max(0, newLines - origLines);
      const deletions = fc.originalContent === '' ? 0 : Math.max(0, origLines - newLines);
      totalInsertions += insertions;
      totalDeletions += deletions;

      const icon = fc.status === 'applied' ? '✓' : fc.status === 'conflict' ? '!' : '·';
      lines.push(`  ${icon} ${fc.path}`);
      lines.push(`     Task: ${fc.taskId} | +${insertions} / -${deletions} lines`);
      if (fc.status === 'pending') {
        lines.push(`     Status: pending (not yet applied)`);
      }
      lines.push('');
    }

    lines.push(`Summary: ${cs.files.length} files | +${totalInsertions} / -${totalDeletions} lines`);
    if (cs.summary) {
      lines.push(
        `  Packages: ${cs.summary.packagesModified} | Tests: ${cs.summary.testsAffected} | Risk: ${cs.summary.risk}`,
      );
      if (cs.summary.healthDelta) {
        lines.push(`  Health delta: ${cs.summary.healthDelta > 0 ? '+' : ''}${cs.summary.healthDelta}`);
      }
    }
    lines.push('');
    lines.push(`Apply with: implement apply ${cs.id}`);

    return lines.join('\n');
  }
}
