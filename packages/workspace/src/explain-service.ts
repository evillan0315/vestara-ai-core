/**
 * ExplainService — Consumes an existing RepositoryWorkspace to produce
 * contextual explanations of architecture, modules, packages, and data flow.
 *
 * Three-tier design:
 *   Tier 1 — Deterministic lookup in RepositoryProfile (always works)
 *   Tier 2 — Knowledge-augmented search in indexed documents (always works)
 *   Tier 3 — AI-synthesized explanation via provider (best-effort)
 *
 * Architecture Traceability:
 *   PCS: PCS-002 — Repository Explanation
 *   Product Principle: Evolve Intelligence Before Autonomy
 *   Foundation: RepositoryWorkspace
 */

import type { AIProvider } from '@vestara/shared';
import type { WorkspaceSession } from './workspace-session';

export interface ExplainResult {
  target: string;
  content: string;
  source: 'deterministic' | 'knowledge' | 'ai';
  duration: number;
}

export class ExplainService {
  private provider?: AIProvider;

  constructor(opts?: { provider?: AIProvider }) {
    this.provider = opts?.provider;
  }

  /**
   * Explain a target within the given workspace session.
   * Tries tiers in order: deterministic → knowledge → AI.
   * Each tier enriches the previous.
   */
  async explain(target: string, session: WorkspaceSession): Promise<ExplainResult> {
    const startTime = performance.now();

    // Tier 1: Deterministic lookup
    const deterministic = this.lookupDeterministic(target, session);
    if (deterministic && !this.needsEnrichment(target)) {
      return {
        target,
        content: deterministic,
        source: 'deterministic',
        duration: Math.round(performance.now() - startTime),
      };
    }

    // Tier 2: Knowledge-augmented
    const knowledgeResult = await this.lookupKnowledge(target, session, deterministic);
    if (knowledgeResult && !this.provider) {
      return {
        target,
        content: knowledgeResult,
        source: 'knowledge',
        duration: Math.round(performance.now() - startTime),
      };
    }

    // Tier 3: AI-synthesized
    if (this.provider && knowledgeResult) {
      const aiResult = await this.synthesizeWithAI(target, knowledgeResult, session);
      if (aiResult) {
        return {
          target,
          content: aiResult,
          source: 'ai',
          duration: Math.round(performance.now() - startTime),
        };
      }
    }

    // Fallback: return the most enriched result available
    const fallback =
      knowledgeResult || deterministic || `Unable to explain "${target}". Try "help" for available commands.`;
    return {
      target,
      content: fallback,
      source: knowledgeResult ? 'knowledge' : 'deterministic',
      duration: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Tier 1: Deterministic lookup using the RepositoryProfile.
   */
  private lookupDeterministic(target: string, session: WorkspaceSession): string | null {
    const profile = session.profile;
    const lowerTarget = target.toLowerCase();

    // Architecture overview
    if (lowerTarget === 'architecture' || lowerTarget === 'arch') {
      const lines: string[] = [];
      lines.push(`Repository: ${profile.name}`);
      lines.push('');

      if (profile.framework) {
        lines.push(`Framework: ${profile.framework}`);
      }
      lines.push(`Language: ${profile.language}`);
      lines.push(`Package Manager: ${profile.packageManager ?? '(none)'}`);
      lines.push(`Monorepo: ${profile.isMonorepo ? 'Yes' : 'No'}`);
      lines.push(`Packages: ${profile.packageCount} (${profile.dependencyCount} dependencies)`);
      lines.push(`File Count: ${profile.fileCount}`);
      if (profile.testFramework) {
        lines.push(`Test Framework: ${profile.testFramework}`);
      }
      lines.push('');

      if (profile.entryPoints.length > 0) {
        lines.push('Entry Points:');
        for (const ep of profile.entryPoints.slice(0, 8)) {
          lines.push(`  • ${ep.path}`);
        }
        lines.push('');
      }

      if (profile.risks.length > 0) {
        lines.push('Detected Risks:');
        for (const risk of profile.risks.slice(0, 5)) {
          const icon = risk.severity === 'high' ? '⚠' : risk.severity === 'medium' ? '•' : '·';
          lines.push(`  ${icon} [${risk.severity}] ${risk.category}: ${risk.detail}`);
        }
        lines.push('');
      }

      return lines.join('\n');
    }

    // Package lookup by name (@vestara/... or full name)
    const packageMatch = profile.packages.find(
      (p) => p.name === target || p.name === `@vestara/${target}` || target.includes(p.name),
    );
    if (packageMatch) {
      const lines: string[] = [];
      lines.push(`Package: ${packageMatch.name}`);
      lines.push(`Path: ${packageMatch.path}`);
      if (packageMatch.isPrivate) lines.push('Private: Yes');
      lines.push('');

      if (packageMatch.dependencies.length > 0) {
        lines.push('Dependencies:');
        for (const dep of packageMatch.dependencies.slice(0, 15)) {
          lines.push(`  • ${dep}`);
        }
        if (packageMatch.dependencies.length > 15) {
          lines.push(`  ... and ${packageMatch.dependencies.length - 15} more`);
        }
        lines.push('');
      }

      return lines.join('\n');
    }

    // Module path lookup (a directory or file path in the repo)
    const matchingFiles = profile.entryPoints.filter((ep) => ep.path.toLowerCase().includes(lowerTarget));
    if (matchingFiles.length > 0) {
      const lines: string[] = [];
      lines.push(`Module: ${target}`);
      lines.push('');

      lines.push('Entry Points:');
      for (const ep of matchingFiles) {
        lines.push(`  • ${ep.path} (${ep.type})`);
      }
      lines.push('');

      // Find containing package
      for (const pkg of profile.packages) {
        if (target.includes(pkg.path) || pkg.path.includes(target)) {
          lines.push(`Part of: ${pkg.name}`);
          lines.push('');
          break;
        }
      }

      return lines.join('\n');
    }

    // Risk summary
    if (lowerTarget === 'risks' || lowerTarget === 'risk') {
      if (profile.risks.length === 0) return 'No risks detected.';
      const lines: string[] = [];
      lines.push(`Risks (${profile.risks.length}):`);
      lines.push('');
      for (const risk of profile.risks) {
        const icon = risk.severity === 'high' ? '⚠' : risk.severity === 'medium' ? '•' : '·';
        lines.push(`  ${icon} [${risk.severity}] ${risk.category}`);
        lines.push(`     ${risk.detail}`);
        lines.push(`     ${risk.location}`);
        lines.push('');
      }
      return lines.join('\n');
    }

    // Dependencies overview
    if (lowerTarget === 'dependencies' || lowerTarget === 'deps') {
      const lines: string[] = [];
      lines.push(`Total Dependencies: ${profile.dependencyCount}`);
      lines.push(`Total Packages: ${profile.packageCount}`);
      lines.push('');
      lines.push('Packages:');
      for (const pkg of profile.packages) {
        const depCount = pkg.dependencies.length + pkg.devDependencies.length;
        lines.push(`  • ${pkg.name} (${depCount} deps)`);
      }
      return lines.join('\n');
    }

    return null;
  }

  /**
   * Tier 2: Augment deterministic data with knowledge base search.
   */
  private async lookupKnowledge(
    target: string,
    session: WorkspaceSession,
    deterministic: string | null,
  ): Promise<string | null> {
    try {
      if (!session.knowledge) return null;
      const results = await session.knowledge.search(target, 5);
      if (results.length === 0) return null;

      // Build context from search results
      const contextLines: string[] = [];
      for (const result of results.slice(0, 3)) {
        const preview = result.document.content.slice(0, 200);
        contextLines.push(`[${result.document.language}] ${result.document.title}:`);
        contextLines.push(`  ${preview}${result.document.content.length > 200 ? '...' : ''}`);
        contextLines.push('');
      }

      if (deterministic) {
        return `${deterministic}\nReferenced Documents:\n\n${contextLines.join('\n')}`;
      }

      return contextLines.join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Tier 3: Use the AI provider to synthesize a richer explanation.
   */
  private async synthesizeWithAI(
    target: string,
    contextData: string,
    _session: WorkspaceSession,
  ): Promise<string | null> {
    try {
      const response = await this.provider!.complete({
        model: 'deepseek-v4-flash-free',
        messages: [
          {
            role: 'system' as const,
            content:
              'You are Vestara, an AI assistant explaining a software repository. ' +
              'Use the provided data to give a clear, concise explanation. ' +
              'Focus on what the developer needs to understand. Be accurate — do not invent facts.',
          },
          {
            role: 'user' as const,
            content: `Explain "${target}" in this repository:\n\n${contextData}`,
          },
        ],
        temperature: 0.4,
        maxTokens: 1024,
      });
      return response.content || null;
    } catch {
      return null;
    }
  }

  /**
   * Determines whether a target would benefit from AI enrichment.
   * Architecture and high-level targets benefit; specific packages less so.
   */
  private needsEnrichment(target: string): boolean {
    const lower = target.toLowerCase();
    return lower === 'architecture' || lower === 'arch' || lower === 'data-flow' || lower === 'dataflow';
  }
}
