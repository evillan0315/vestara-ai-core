/**
 * MonitorService — File system watcher that auto-triggers workspace operations.
 *
 * Watches the repository file system for changes and automatically
 * re-indexes modified files, updates health scores, and emits events.
 * Runs as a background service in the AI OS (Layer 6).
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Repository Monitoring
 *   AI-OS Manifest — vestara-monitor.service
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KnowledgeEngine } from '@vestara/knowledge';
import type { KnowledgeGraphStorage } from './knowledge-graph-storage';
import type { WorkspaceSession } from './workspace-session';

export type MonitorEvent = {
  type: 'file-changed' | 'file-added' | 'file-removed' | 'reindex-complete' | 'health-updated';
  path: string;
  timestamp: string;
};

export class MonitorService {
  private session: WorkspaceSession;
  private graph: KnowledgeGraphStorage;
  private knowledgeEngine?: KnowledgeEngine;
  private watcher: fs.FSWatcher | null = null;
  private watchedDirs: string[] = [];
  private onChange: ((event: MonitorEvent) => void) | null = null;
  private active = false;

  constructor(session: WorkspaceSession, graph: KnowledgeGraphStorage, knowledgeEngine?: KnowledgeEngine) {
    this.session = session;
    this.graph = graph;
    this.knowledgeEngine = knowledgeEngine;
  }

  /**
   * Start monitoring the workspace root directory.
   */
  async start(onChange?: (event: MonitorEvent) => void): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.onChange = onChange || null;

    const rootDir = this.session.rootPath;
    this.watchedDirs = this.collectWatchDirs(rootDir);

    // Watch the root directory for changes
    try {
      this.watcher = fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.resolve(rootDir, filename);

        // Skip ignored directories
        const ignored = ['node_modules', '.git', 'dist', 'build', '.vestara', 'coverage'];
        const relParts = filename.split(path.sep);
        if (ignored.some((d) => relParts.includes(d))) return;

        const type =
          eventType === 'rename' ? (fs.existsSync(fullPath) ? 'file-added' : 'file-removed') : 'file-changed';

        const event: MonitorEvent = { type, path: filename, timestamp: new Date().toISOString() };
        this.onChange?.(event);

        // Auto-trigger reindex for supported files
        const ext = path.extname(filename).toLowerCase();
        const supported = [
          '.ts',
          '.js',
          '.tsx',
          '.jsx',
          '.py',
          '.rs',
          '.go',
          '.md',
          '.json',
          '.yaml',
          '.yml',
          '.css',
          '.html',
        ];
        if (supported.includes(ext) && (type === 'file-changed' || type === 'file-added')) {
          this.handleFileChange(fullPath, filename).catch(() => {});
        }
      });

      this.emit({ type: 'health-updated', path: rootDir, timestamp: new Date().toISOString() });
    } catch (_err) {
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
  }

  get isActive(): boolean {
    return this.active;
  }

  get watchedDirectoryCount(): number {
    return this.watchedDirs.length;
  }

  private async handleFileChange(fullPath: string, relativePath: string): Promise<void> {
    try {
      // Re-index into knowledge chunk DB if engine is available
      if (this.knowledgeEngine) {
        await this.knowledgeEngine.indexer.indexFile(fullPath);
      }

      // Always update the knowledge graph
      const content = fs.readFileSync(fullPath, 'utf-8');
      await this.graph.upsertNode({
        id: `monitor-doc-${Date.now()}`,
        type: 'artifact',
        name: relativePath,
        description: `Auto-indexed: ${content.length} bytes`,
        sourceArtifacts: [`file:${relativePath}`],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      this.emit({ type: 'reindex-complete', path: relativePath, timestamp: new Date().toISOString() });
    } catch {
      // file may have been deleted between detection and read
    }
  }

  private collectWatchDirs(rootDir: string): string[] {
    const dirs: string[] = [rootDir];
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules' &&
          entry.name !== 'dist'
        ) {
          dirs.push(path.join(rootDir, entry.name));
        }
      }
    } catch {
      /* skip unreadable */
    }
    return dirs;
  }

  private emit(event: MonitorEvent): void {
    this.onChange?.(event);
  }
}
