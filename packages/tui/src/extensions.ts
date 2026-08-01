import type { TuiViewContribution } from './types.js';

/**
 * Presentation-safe registry for Marketplace TUI contributions.
 * Runtime packages contribute descriptors; the TUI retains rendering ownership.
 */
export class TuiExtensionRegistry {
  private readonly views = new Map<string, TuiViewContribution>();

  registerView(contribution: TuiViewContribution): () => void {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(contribution.id)) {
      throw new Error(`Invalid TUI view contribution id: ${contribution.id}`);
    }
    if (!contribution.label.trim()) throw new Error('TUI view contribution label is required');
    if (this.views.has(contribution.id))
      throw new Error(`TUI view contribution already registered: ${contribution.id}`);
    this.views.set(contribution.id, Object.freeze({ ...contribution }));
    return () => this.views.delete(contribution.id);
  }

  listViews(): readonly TuiViewContribution[] {
    return [...this.views.values()];
  }

  clear(): void {
    this.views.clear();
  }
}
