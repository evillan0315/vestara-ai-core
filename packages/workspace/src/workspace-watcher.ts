/**
 * WorkspaceWatcher — File change monitoring for the Workspace Runtime.
 *
 * Watches workspace files for changes and automatically:
 *   - Updates the workspace index
 *   - Invalidates caches
 *   - Notifies runtime via events
 *   - Keeps the AI context synchronized
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { WorkspaceIndex } from './workspace-index';

export type WatchEventType = 'file-changed' | 'file-added' | 'file-removed' | 'directory-added' | 'directory-removed';

export interface WatchEvent {
  type: WatchEventType;
  path: string;
  timestamp: string;
}

export type WatchCallback = (event: WatchEvent) => void;

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.cache',
  'target',
  '.venv',
  '.vestara',
  '.idea',
  '.vscode',
  '.turbo',
  '.nx',
  '.serverless',
]);

const WATCHED_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.rb',
  '.php',
  '.cs',
  '.swift',
  '.kt',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.css',
  '.scss',
  '.html',
  '.vue',
  '.svelte',
  '.toml',
  '.sh',
  '.env',
  '.graphql',
  '.sql',
]);

export class WorkspaceWatcher {
  private rootDir: string;
  private index: WorkspaceIndex;
  private eventBus?: EventBus;
  private logger?: Logger;
  private watcher: fs.FSWatcher | null = null;
  private active = false;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private callback?: WatchCallback;

  constructor(options: {
    rootDir: string;
    index: WorkspaceIndex;
    eventBus?: EventBus;
    logger?: Logger;
  }) {
    this.rootDir = path.resolve(options.rootDir);
    this.index = options.index;
    this.eventBus = options.eventBus;
    this.logger = options.logger?.child({ component: 'workspace-watcher' });
  }

  get isWatching(): boolean {
    return this.active;
  }

  start(callback?: WatchCallback): void {
    if (this.active) return;
    this.active = true;
    this.callback = callback;

    try {
      this.watcher = fs.watch(this.rootDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const relPath = filename.replace(/\\/g, '/');
        const parts = relPath.split('/');

        if (parts.some((p) => IGNORE_DIRS.has(p))) return;

        const ext = path.extname(relPath).toLowerCase();
        if (!WATCHED_EXTENSIONS.has(ext)) return;

        this.debounce(relPath, () => {
          this.handleChange(eventType, relPath);
        });
      });

      this.logger?.info('File watcher started', { rootDir: this.rootDir });
      this.emitEvent('watch:started', { rootDir: this.rootDir });
    } catch (error) {
      this.active = false;
      this.logger?.warn('File watcher failed to start', { error });
    }
  }

  stop(): void {
    this.active = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.logger?.info('File watcher stopped');
  }

  private handleChange(eventType: string, relPath: string): void {
    const fullPath = path.join(this.rootDir, relPath);

    let type: WatchEventType;

    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        type = eventType === 'rename' ? 'directory-added' : 'directory-added';
        this.emitEvent('workspace:watch.directory-added', { path: relPath });
      } else {
        type = eventType === 'rename' ? 'file-added' : 'file-changed';
        this.index.addEntry(relPath);
        this.emitEvent('workspace:watch.file-changed', { path: relPath });
      }
    } catch {
      type = 'file-removed';
      this.index.removeEntry(relPath);
      this.emitEvent('workspace:watch.file-removed', { path: relPath });
    }

    const event: WatchEvent = { type, path: relPath, timestamp: new Date().toISOString() };
    this.callback?.(event);
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        fn();
      }, 300),
    );
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.eventBus) return;
    void this.eventBus.emit({
      type,
      source: 'workspace-watcher',
      payload: { ...payload, timestamp: new Date().toISOString() },
    });
  }
}
