/**
 * @vestara/settings-framework — Search Engine
 *
 * Cross-module settings search with relevance scoring.
 *
 * Architecture Traceability:
 *   Settings Framework: 06-Registry.md → Search Index
 *   Natural Law: Knowledge must outlive its creator
 */

import type { SearchEngine as ISearchEngine, SettingsModule, SettingsSearchResult } from './types.js';

// ─── Search Engine ───────────────────────────────────────────

export class SearchEngine implements ISearchEngine {
  private modules = new Map<string, SettingsSearchResult>();

  index(module: SettingsModule): void {
    this.modules.set(module.id, {
      moduleId: module.id,
      name: module.name,
      description: module.description,
      path: module.path,
      score: 1,
    });
  }

  deindex(moduleId: string): void {
    this.modules.delete(moduleId);
  }

  search(query: string): SettingsSearchResult[] {
    const lowerQuery = query.toLowerCase();
    const results: SettingsSearchResult[] = [];

    for (const [, entry] of this.modules) {
      const score = this.calculateScore(entry, lowerQuery);
      if (score > 0) {
        results.push({ ...entry, score });
      }
    }

    // Sort by score (highest first)
    return results.sort((a, b) => b.score - a.score);
  }

  private calculateScore(entry: SettingsSearchResult, query: string): number {
    let score = 0;

    // Exact match in name (highest weight)
    if (entry.name.toLowerCase() === query) {
      score += 10;
    }
    // Partial match in name
    else if (entry.name.toLowerCase().includes(query)) {
      score += 5;
    }

    // Match in description
    if (entry.description?.toLowerCase().includes(query)) {
      score += 3;
    }

    // Match in path
    if (entry.path.toLowerCase().includes(query)) {
      score += 1;
    }

    return score;
  }

  // ─── Bulk Operations ─────────────────────────────────────

  indexModules(modules: SettingsModule[]): void {
    for (const module of modules) {
      this.index(module);
    }
  }

  clearIndex(): void {
    this.modules.clear();
  }

  getIndexSize(): number {
    return this.modules.size;
  }
}
