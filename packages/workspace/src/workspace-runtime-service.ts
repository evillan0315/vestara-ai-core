/**
 * WorkspaceRuntimeService — The core Workspace Runtime that implements
 * the VestaraService lifecycle and ties together all workspace services.
 *
 * This is a runtime in the @vestara/runtime sense — it has a full
 * state machine lifecycle (created → initializing → running → stopped)
 * and can be registered with the Kernel via the service registry.
 *
 * Responsibilities:
 *   - Workspace Discovery (git, monorepo, package manager, etc.)
 *   - Project Detection (frameworks, languages, build tools, etc.)
 *   - Project Context (structured profile for AI)
 *   - Workspace Index (in-memory file index)
 *   - Filesystem API (read, write, ls, tree, glob, search, etc.)
 *   - Git Integration (status, diff, branch, log, checkout, blame)
 *   - File Watching (change monitoring + index updates)
 *   - AI Tool Calling (workspace tools for LLM interaction)
 *   - Workspace Context Injection (auto-inject into provider requests)
 *   - Security Model (path sandboxing)
 */

import type { Tool } from '@vestara/action';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { Runtime, type RuntimeConfig } from '@vestara/runtime';
import { FilesystemService } from './fs-service';
import { GitService } from './git-service';
import { type ProjectProfile, ProjectProfileService } from './project-profile';
import { WorkspaceContextProvider } from './workspace-context-provider';
import { WorkspaceIndex } from './workspace-index';
import { WorkspaceToolProvider } from './workspace-tool-provider';
import { WorkspaceWatcher } from './workspace-watcher';

export interface WorkspaceRuntimeServiceConfig {
  rootDir: string;
  eventBus?: EventBus;
  logger?: Logger;
}

export interface WorkspaceRuntimeServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  indexedFiles: number;
  indexedDirectories: number;
  isGitRepository: boolean;
  watcherActive: boolean;
  uptime: number;
}

export class WorkspaceRuntimeService extends Runtime {
  private _fs: FilesystemService | null = null;
  private _git: GitService | null = null;
  private _index: WorkspaceIndex | null = null;
  private _profile: ProjectProfile | null = null;
  private _contextProvider: WorkspaceContextProvider | null = null;
  private _toolProvider: WorkspaceToolProvider | null = null;
  private _watcher: WorkspaceWatcher | null = null;

  private _serviceRootDir: string;
  private _serviceEventBus?: EventBus;
  private _serviceLogger?: Logger;
  private _serviceStartedAt: number = 0;
  private _profileService: ProjectProfileService | null = null;

  constructor(config: RuntimeConfig & WorkspaceRuntimeServiceConfig) {
    super(
      {
        id: config.id,
        type: config.type,
        name: config.name ?? 'Workspace Runtime',
        description: config.description ?? 'Manages workspace discovery, indexing, filesystem, and project context',
        metadata: config.metadata,
        eventBus: config.eventBus,
        lifecycleConfig: config.lifecycleConfig,
        capabilities: ['workspace', 'filesystem', 'git', 'project-discovery'],
      },
      {
        onInitialize: async () => {
          this._serviceRootDir = config.rootDir;
          this._serviceEventBus = config.eventBus;
          this._serviceLogger = config.logger?.child({ component: 'workspace-runtime' });
          this._serviceLogger?.info('Workspace runtime initializing', { rootDir: this._serviceRootDir });

          this._index = new WorkspaceIndex({ rootDir: this._serviceRootDir });
          this._fs = new FilesystemService(this._serviceRootDir, this._index);
          this._git = new GitService(this._serviceRootDir);
          this._profileService = new ProjectProfileService(this._serviceRootDir);
          this._contextProvider = new WorkspaceContextProvider();

          const detectedProfile = this._profileService.detect();
          this._profile = detectedProfile;
          this._contextProvider.setWorkspaceContext({
            profile: detectedProfile,
            gitBranch: this._git.branch(),
            gitStatus: this._git.status()?.hasUncommitted ? 'has uncommitted changes' : 'clean',
            indexedFiles: this._index.totalFiles,
            updatedAt: new Date().toISOString(),
          });

          this._toolProvider = new WorkspaceToolProvider(this._fs, this._git, this._index);

          this._serviceLogger?.info('Workspace profile detected', {
            name: detectedProfile.name,
            language: detectedProfile.primaryLanguage.name,
            frameworks: detectedProfile.frameworks.map((f) => f.name).join(', '),
            isMonorepo: detectedProfile.isMonorepo,
            apps: detectedProfile.apps.length,
            packages: detectedProfile.packages.length,
          });

          this._serviceStartedAt = Date.now();

          await this._index!.scan();

          this._watcher = new WorkspaceWatcher({
            rootDir: this._serviceRootDir,
            index: this._index!,
            eventBus: this._serviceEventBus,
            logger: this._serviceLogger,
          });

          this._watcher.start((event) => {
            this.emitRuntimeEvent('workspace:file.changed', {
              type: event.type,
              path: event.path,
            });
          });

          await this.emitEvent('workspace:runtime.started', {
            rootDir: this._serviceRootDir,
            files: this._index!.totalFiles,
            directories: this._index!.totalDirectories,
          });

          this._serviceLogger?.info('Workspace runtime started', {
            files: this._index!.totalFiles,
            isGit: this._git!.isRepository,
          });
        },
        onStop: async () => {
          if (this._watcher) {
            this._watcher.stop();
            this._watcher = null;
          }

          await this.emitEvent('workspace:runtime.stopped', {
            rootDir: this._serviceRootDir,
            files: this._index?.totalFiles ?? 0,
          });

          this._serviceLogger?.info('Workspace runtime stopped');
        },
        onDestroy: async () => {
          this._fs = null;
          this._git = null;
          this._index = null;
          this._profile = null;
          this._profileService = null;
          this._contextProvider = null;
          this._toolProvider = null;
          this._watcher = null;
        },
      },
    );

    this._serviceRootDir = config.rootDir;
    this._serviceEventBus = config.eventBus;
    this._serviceLogger = config.logger;
  }

  get filesystem(): FilesystemService {
    if (!this._fs) throw new Error('WorkspaceRuntime not initialized');
    return this._fs;
  }

  get git(): GitService {
    if (!this._git) throw new Error('WorkspaceRuntime not initialized');
    return this._git;
  }

  get index(): WorkspaceIndex {
    if (!this._index) throw new Error('WorkspaceRuntime not initialized');
    return this._index;
  }

  get profile(): ProjectProfile {
    if (!this._profile) throw new Error('WorkspaceRuntime not initialized');
    return this._profile;
  }

  get contextProvider(): WorkspaceContextProvider {
    if (!this._contextProvider) throw new Error('WorkspaceRuntime not initialized');
    return this._contextProvider;
  }

  get toolProvider(): WorkspaceToolProvider {
    if (!this._toolProvider) throw new Error('WorkspaceRuntime not initialized');
    return this._toolProvider;
  }

  get watcher(): WorkspaceWatcher | null {
    return this._watcher;
  }

  getRuntimeHealth(): WorkspaceRuntimeServiceHealth {
    const uptime = this._serviceStartedAt > 0 ? Math.floor((Date.now() - this._serviceStartedAt) / 1000) : 0;
    return {
      status: this.state === 'running' ? 'healthy' : this.state === 'degraded' ? 'degraded' : 'unhealthy',
      indexedFiles: this._index?.totalFiles ?? 0,
      indexedDirectories: this._index?.totalDirectories ?? 0,
      isGitRepository: this._git?.isRepository ?? false,
      watcherActive: this._watcher?.isWatching ?? false,
      uptime,
    };
  }

  getAllTools(): Tool[] {
    return this._toolProvider?.getAllTools() ?? [];
  }

  refreshProjectProfile(): void {
    if (!this._profileService || !this._contextProvider) return;
    const detectedProfile = this._profileService.detect();
    this._profile = detectedProfile;
    this._contextProvider.setWorkspaceContext({
      profile: detectedProfile,
      gitBranch: this._git?.branch() ?? null,
      gitStatus: this._git?.status()?.hasUncommitted ? 'has uncommitted changes' : 'clean',
      indexedFiles: this._index?.totalFiles ?? 0,
      updatedAt: new Date().toISOString(),
    });
  }

  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this._serviceEventBus) return;
    await this._serviceEventBus.emit({
      type,
      source: 'workspace-runtime-service',
      payload: { ...payload, runtimeId: this.id },
    });
  }
}
