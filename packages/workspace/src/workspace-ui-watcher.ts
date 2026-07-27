/**
 * WorkspaceUiWatcher — Monitors workspace-ui directory changes and milestone
 * updates to trigger automated test + build via the Tester agent.
 *
 * Debounces rapid file changes and integrates with the EventBus for
 * milestone:completed events.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EventBus } from '@vestara/event-bus';

export type WorkspaceUiWatchEvent = {
  type: 'file-changed' | 'milestone-updated';
  detail: string;
  timestamp: string;
};

export class WorkspaceUiWatcher {
  private rootPath: string;
  private eventBus?: EventBus;
  private watcher: fs.FSWatcher | null = null;
  private onChange: ((event: WorkspaceUiWatchEvent) => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private pendingChanges: Set<string> = new Set();

  constructor(rootPath: string, eventBus?: EventBus) {
    this.rootPath = path.resolve(rootPath, 'apps', 'workspace');
    this.eventBus = eventBus;
  }

  /**
   * Start monitoring workspace-ui directory.
   */
  async start(onChange?: (event: WorkspaceUiWatchEvent) => void): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.onChange = onChange || null;

    const target = this.rootPath;
    if (!fs.existsSync(target)) {
      return;
    }

    // Subscribe to milestone events if eventBus is available
    if (this.eventBus) {
      this.eventBus.subscribe('milestone:*', async (event) => {
        if (event.type === 'milestone:completed') {
          this.emit({
            type: 'milestone-updated',
            detail: `Milestone completed: ${event.payload?.version ?? event.type}`,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    // Watch workspace-ui directory for file changes
    try {
      this.watcher = fs.watch(target, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        const relParts = filename.split(path.sep);
        const ignored = ['node_modules', 'dist', 'build', '.vestara'];
        if (ignored.some((d) => relParts.includes(d))) return;

        this.pendingChanges.add(filename);
        this.debounceEmit();
      });
    } catch {
      this.active = false;
    }
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.active = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges.clear();
  }

  get isActive(): boolean {
    return this.active;
  }

  private debounceEmit(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const files = Array.from(this.pendingChanges);
      this.pendingChanges.clear();
      this.emit({
        type: 'file-changed',
        detail: `Files changed in workspace-ui:\n${files
          .slice(0, 10)
          .map((f) => `  • ${f}`)
          .join('\n')}${files.length > 10 ? `\n  ... and ${files.length - 10} more` : ''}`,
        timestamp: new Date().toISOString(),
      });
    }, 2000);
  }

  private emit(event: WorkspaceUiWatchEvent): void {
    this.onChange?.(event);
    if (this.eventBus) {
      this.eventBus
        .emit({
          type: 'workspace-ui:changed',
          source: 'workspace-ui-watcher',
          payload: event as any,
        })
        .catch(() => {});
    }
  }
}
