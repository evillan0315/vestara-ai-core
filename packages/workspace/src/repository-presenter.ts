/**
 * RepositoryPresenter — Stage 6 of the open pipeline.
 *
 * Separates the presentation of repository understanding from the runtime.
 * WorkspaceRuntime owns analysis and indexing; RepositoryPresenter owns
 * rendering. Five versions from now, when Vestara has a desktop UI, REST API,
 * IDE extension, and voice interface, they all consume the same
 * RepositoryWorkspace and render it differently.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Foundation: RepositoryWorkspace, Executive Brain
 */

import type { AIProvider, CompletionResponse } from '@vestara/shared';
import type { IndexReport, PresentedSummary, RepositoryProfile } from './types';

export class RepositoryPresenter {
  private provider?: AIProvider;

  constructor(opts?: { provider?: AIProvider }) {
    this.provider = opts?.provider;
  }

  /**
   * Produce a structured summary. AI narrative is best-effort:
   * if the provider is unavailable or the call fails, narrative is null
   * but deterministic facts are always present.
   */
  async present(profile: RepositoryProfile, _indexReport: IndexReport): Promise<PresentedSummary> {
    const facts = this.extractFacts(profile);
    let narrative: PresentedSummary['narrative'] = null;

    if (this.provider) {
      try {
        narrative = await this.synthesizeNarrative(profile);
      } catch {
        // AI unavailable — degrade gracefully
      }
    }

    return { facts, narrative };
  }

  extractFacts(profile: RepositoryProfile): PresentedSummary['facts'] {
    return {
      language: profile.language,
      framework: profile.framework ?? null,
      packageManager: profile.packageManager ?? null,
      fileCount: profile.fileCount,
      packageCount: profile.packageCount,
      dependencyCount: profile.dependencyCount,
      isMonorepo: profile.isMonorepo,
      healthScore: profile.healthScore?.overall,
      entryPoints: profile.entryPoints.map((ep) => ep.path),
      entryPointDetails: profile.entryPoints.map((ep) => ({
        path: ep.path,
        type: ep.type,
        confidence: ep.confidence,
      })),
      risks: profile.risks.map((r) => ({
        category: r.category,
        severity: r.severity,
        detail: r.detail,
      })),
      cycles: profile.dependencyGraph?.cycles,
      layers: profile.layers?.map((l) => ({
        packageName: l.packageName,
        layer: l.layer,
      })),
    };
  }

  private async synthesizeNarrative(profile: RepositoryProfile): Promise<PresentedSummary['narrative']> {
    const prompt = this.buildPrompt(profile);

    let response: CompletionResponse;
    try {
      response = await this.provider!.complete({
        model: 'deepseek-v4-flash-free',
        messages: [
          {
            role: 'system',
            content: "You are Vestara's Executive Brain. Analyze repository profiles and return JSON.",
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        maxTokens: 1024,
      });
    } catch {
      return null;
    }

    if (!response.content) return null;

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(response.content);
      if (!parsed.purpose) return null;
      return {
        purpose: parsed.purpose,
        suggestedStartingPoints: Array.isArray(parsed.suggestedStartingPoints) ? parsed.suggestedStartingPoints : [],
        keyObservations: Array.isArray(parsed.keyObservations) ? parsed.keyObservations : [],
      };
    } catch {
      return null;
    }
  }

  private buildPrompt(profile: RepositoryProfile): string {
    const entryPoints = profile.entryPoints.map((ep) => ep.path).join('\n');
    const risks = profile.risks.map((r) => `  [${r.severity}] ${r.category}: ${r.detail} (${r.location})`).join('\n');

    return `Analyze this repository profile and produce a JSON response with three fields:

1. "purpose": A 1-2 sentence description of what this repository appears to be building.
2. "suggestedStartingPoints": An array of 3-5 numbered suggestions for someone new to this project (e.g., "Explain the architecture", "Show runtime lifecycle", "Describe package relationships", "Identify technical debt", "Build a feature").
3. "keyObservations": An array of 2-4 concise observations about the architecture, structure, or notable patterns.

Repository Profile:
- Language: ${profile.language}
- Framework: ${profile.framework ?? '(none detected)'}
- Package Manager: ${profile.packageManager ?? '(none detected)'}
- Monorepo: ${profile.isMonorepo ? 'Yes' : 'No'}
- Total Files: ${profile.fileCount}
- Packages: ${profile.packageCount}
- Dependencies: ${profile.dependencyCount}
- Test Framework: ${profile.testFramework ?? '(none detected)'}
- Docker: ${profile.hasDocker ? 'Yes' : 'No'}
- CI: ${profile.hasCI ? 'Yes' : 'No'}

Entry Points:
${entryPoints || '(none detected)'}

Detected Risks:
${risks || '(none detected)'}

Return ONLY valid JSON: { "purpose": "...", "suggestedStartingPoints": ["..."], "keyObservations": ["..."] }`;
  }

  /**
   * Render the summary as formatted text for CLI output.
   */
  renderCli(summary: PresentedSummary): string {
    const lines: string[] = [];

    lines.push('Repository Summary');
    lines.push('────────────────────────────────────');
    lines.push('');

    if (summary.narrative?.purpose) {
      lines.push(`  ${summary.narrative.purpose}`);
      lines.push('');
    }

    lines.push(`  Language:       ${summary.facts.language}`);
    if (summary.facts.framework) {
      lines.push(`  Framework:      ${summary.facts.framework}`);
    }
    if (summary.facts.packageManager) {
      lines.push(`  Packages:       ${summary.facts.packageManager}`);
    }
    lines.push(`  Files:          ${summary.facts.fileCount}`);
    lines.push(`  Packages:       ${summary.facts.packageCount}`);
    lines.push(`  Dependencies:   ${summary.facts.dependencyCount}`);
    lines.push(`  Monorepo:       ${summary.facts.isMonorepo ? 'Yes' : 'No'}`);
    if (summary.facts.healthScore !== undefined) {
      const score = summary.facts.healthScore;
      const color = score >= 7 ? '✓' : score >= 4 ? '∼' : '⚠';
      lines.push(`  Health Score:   ${color} ${score.toFixed(1)} / 10.0`);
    }
    lines.push('');

    if (summary.facts.entryPointDetails && summary.facts.entryPointDetails.length > 0) {
      lines.push('  Entry Points:');
      for (const ep of summary.facts.entryPointDetails.slice(0, 8)) {
        const confidence = ep.confidence >= 0.7 ? '✓' : ep.confidence >= 0.4 ? '~' : '?';
        lines.push(`    ${confidence} ${ep.path} (${ep.type}, ${Math.round(ep.confidence * 100)}%)`);
      }
      lines.push('');
    } else if (summary.facts.entryPoints.length > 0) {
      lines.push('  Entry Points:');
      for (const ep of summary.facts.entryPoints.slice(0, 5)) {
        lines.push(`    • ${ep}`);
      }
      lines.push('');
    }

    if (summary.facts.layers && summary.facts.layers.length > 0) {
      lines.push('  Architecture Layers:');
      const byLayer = new Map<string, string[]>();
      for (const l of summary.facts.layers) {
        const list = byLayer.get(l.layer) ?? [];
        list.push(l.packageName);
        byLayer.set(l.layer, list);
      }
      for (const [layer, pkgs] of byLayer) {
        lines.push(`    ${layer}: ${pkgs.join(', ')}`);
      }
      lines.push('');
    }

    if (summary.facts.cycles && summary.facts.cycles.length > 0) {
      lines.push('  Circular Dependencies:');
      for (const cycle of summary.facts.cycles) {
        lines.push(`    ⚠ ${cycle.join(' → ')}`);
      }
      lines.push('');
    }

    if (summary.facts.risks.length > 0) {
      lines.push('  Detected Risks:');
      for (const risk of summary.facts.risks.slice(0, 8)) {
        const icon = risk.severity === 'high' ? '⚠' : risk.severity === 'medium' ? '•' : '·';
        lines.push(`    ${icon} ${risk.category}: ${risk.detail}`);
      }
      lines.push('');
    }

    if (summary.narrative?.suggestedStartingPoints && summary.narrative.suggestedStartingPoints.length > 0) {
      lines.push('  Suggested Starting Points:');
      for (let i = 0; i < summary.narrative.suggestedStartingPoints.length; i++) {
        lines.push(`    ${i + 1}. ${summary.narrative.suggestedStartingPoints[i]}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Render as JSON.
   */
  renderJson(summary: PresentedSummary): string {
    return JSON.stringify(summary, null, 2);
  }
}
