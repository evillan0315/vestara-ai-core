/**
 * WorkspaceRuntime — The canonical pipeline orchestrator.
 *
 * A true state machine that sequences the open pipeline stages:
 *   Idle → Discovering → Fingerprinting → Analyzing → Indexing → Presenting → Ready
 *
 * Each stage enriches a single RepositoryWorkspace domain object.
 * Every future consumer (CLI, REST API, desktop Workspace, IDE extension,
 * Vestara OS) calls open() and observes the same status transitions.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Blueprint: Book 3 — AI Architecture
 *   Foundation: RepositoryWorkspace, VOM
 *   Runtime: Kernel Lifecycle
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { AIProvider, CompletionResponse, StreamChunk } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { RepositoryDiscovery } from './repository-discovery';
import { createFingerprint } from './repository-fingerprint';
import { RepositoryIntelligence } from './repository-intelligence';
import { RepositoryPresenter } from './repository-presenter';
import type { OpenResult, RepositoryWorkspace, StageTimings, WorkspaceStatus } from './types';
import { WorkspaceManifest } from './workspace-manifest';
import { PREFERENCES_MANIFEST } from './workspace-migrations';
import { WorkspaceSession } from './workspace-session';

export class WorkspaceRuntime {
  private status: WorkspaceStatus = 'idle';
  private session: WorkspaceSession | null = null;
  private _persistPrefs?: () => void;
  private workspace: RepositoryWorkspace = {
    identity: null,
    discovery: null,
    analysis: null,
    index: null,
    presentation: null,
    status: 'idle',
  };
  private eventBus?: EventBus;
  private logger?: Logger;
  private provider?: AIProvider;

  constructor(opts?: {
    eventBus?: EventBus;
    logger?: Logger;
    provider?: AIProvider;
  }) {
    this.eventBus = opts?.eventBus;
    this.logger = opts?.logger?.child({ component: 'workspace-runtime' });
    this.provider = opts?.provider;
  }

  get currentStatus(): WorkspaceStatus {
    return this.status;
  }

  get currentSession(): WorkspaceSession | null {
    return this.session;
  }

  get currentWorkspace(): RepositoryWorkspace {
    return { ...this.workspace };
  }

  /**
   * Open a repository at the given path.
   * Returns immediately with the OpenResult once the pipeline completes.
   */
  async open(rootDir: string): Promise<OpenResult> {
    const startTime = performance.now();
    const clockTime = Date.now(); // wall clock for display
    const resolvedPath = path.resolve(rootDir);

    // Validate path
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${resolvedPath}`);
    }
    if (!fs.statSync(resolvedPath).isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedPath}`);
    }

    const timings: StageTimings = {
      discover: 0,
      fingerprint: 0,
      analyze: 0,
      index: 0,
      present: 0,
      session: 0,
      total: 0,
    };

    const workspaceDir = path.join(resolvedPath, '.vestara');

    try {
      // ── Stage 1: Discover ─────────────────────────────────
      this.transition('discovering');
      let t0 = performance.now();
      const discovery = await RepositoryDiscovery.discover(resolvedPath);
      timings.discover = Math.round(performance.now() - t0);
      this.workspace.discovery = discovery;
      this.logger?.info('Discovery completed', {
        files: discovery.totalFiles,
        sizeKB: discovery.totalSizeKB,
      });
      await this.emit('workspace:discover.completed', {
        fileCount: discovery.totalFiles,
      });

      // ── Stage 2: Fingerprint ──────────────────────────────
      this.transition('fingerprinting');
      t0 = performance.now();
      const fingerprint = await createFingerprint(resolvedPath);
      timings.fingerprint = Math.round(performance.now() - t0);
      this.workspace.identity = fingerprint;
      this.logger?.info('Fingerprint completed', {
        name: fingerprint.name,
        git: fingerprint.gitCommit ? 'git' : 'non-git',
      });
      await this.emit('workspace:fingerprint.completed', {
        name: fingerprint.name,
        id: fingerprint.id,
      });

      // Check for existing cached workspace
      const existingManifest = await WorkspaceManifest.load(workspaceDir);
      const isCached = existingManifest !== null && !WorkspaceManifest.isStale(existingManifest, fingerprint);

      if (isCached) {
        // Fast path: reuse cached analysis
        this.workspace.analysis = existingManifest.analysis;
        this.logger?.info('Using cached analysis from .vestara/');
      } else {
        // ── Stage 3: Analyze ──────────────────────────────
        this.transition('analyzing');
        t0 = performance.now();
        const analysis = await RepositoryIntelligence.analyze(discovery.files, resolvedPath);
        analysis.totalSizeKB = discovery.totalSizeKB;
        this.workspace.analysis = analysis;
        this.logger?.info('Analysis completed', {
          language: analysis.language,
          entryPoints: analysis.entryPoints.length,
          risks: analysis.risks.length,
        });
        await this.emit('workspace:analysis.completed', {
          language: analysis.language,
          entryPointCount: analysis.entryPoints.length,
          riskCount: analysis.risks.length,
        });
        timings.analyze = Math.round(performance.now() - t0);
      }

      // ── Stage 4: Manifest ─────────────────────────────────
      // Create or update the .vestara/ manifest
      let manifest: any;
      let filesChanged: string[] | undefined;
      if (existingManifest && !WorkspaceManifest.isStale(existingManifest, fingerprint)) {
        manifest = existingManifest;
        await WorkspaceManifest.touch(workspaceDir);
        // Detect file changes since last open
        if (existingManifest.files?.mtimeCache) {
          filesChanged = WorkspaceManifest.detectChangedFiles(discovery.mtimeCache, existingManifest.files.mtimeCache);
          if (filesChanged.length === 0) {
            this.logger?.info('No files changed since last open — sub-second warm open');
          } else {
            this.logger?.info(`Detected ${filesChanged.length} changed files since last open`);
          }
        }
      } else {
        manifest = await WorkspaceManifest.create(workspaceDir, fingerprint, this.workspace.analysis!);
      }
      await this.emit('workspace:manifest.created', {});

      // Persist file mtime cache for incremental detection on next open
      await WorkspaceManifest.updateFiles(workspaceDir, {
        count: discovery.totalFiles,
        totalSizeKB: discovery.totalSizeKB,
        byExtension: discovery.byExtension,
        mtimeCache: discovery.mtimeCache,
      });

      // ── Present (before indexing — always fast) ───────────
      this.transition('presenting');
      t0 = performance.now();
      const presenter = new RepositoryPresenter({ provider: this.provider });
      const stubIndex = { documentsIndexed: 0, chunksCreated: 0, duration: 0 };

      // Use cached AI narrative if available
      const cachedNarrative = manifest ? WorkspaceManifest.loadCachedNarrative(manifest) : null;
      let presentation;
      if (cachedNarrative) {
        presentation = {
          facts: presenter.extractFacts(this.workspace.analysis!),
          narrative: cachedNarrative,
        };
        this.logger?.info('Using cached AI narrative');
      } else {
        presentation = await presenter.present(this.workspace.analysis!, this.workspace.index ?? stubIndex);
        // Cache narrative for next open (fire-and-forget)
        if (presentation.narrative) {
          WorkspaceManifest.cacheNarrative(workspaceDir, presentation.narrative).catch(() => {});
        }
      }
      this.workspace.presentation = presentation;
      timings.present = Math.round(performance.now() - t0);
      await this.emit('workspace:present.completed', {});

      // ── Session initialization (before deferred index) ────
      const { DefaultConversationService } = await import('@vestara/conversation');
      const { DefaultUnderstandingEngine } = await import('./understanding-engine.js');
      const { UnderstandingContextAssembler } = await import('./understanding-context-assembler.js');
      const contextAssembler = new UnderstandingContextAssembler(
        null,
        `You are Vestara, an AI assistant helping with the "${fingerprint.name}" repository. ` +
          `The repository is written in ${this.workspace.analysis?.language ?? 'unknown'}.`,
      );

      const conversation = new DefaultConversationService({
        contextAssembler,
        providerExecutor: this.provider ?? {
          complete: async (): Promise<CompletionResponse> => ({
            id: 'mock',
            model: 'mock',
            provider: 'mock',
            content: 'AI provider not available.',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latency: 0,
          }),
          stream: async function* (): AsyncGenerator<StreamChunk> {
            yield {
              id: 'mock',
              type: 'text',
              content: 'AI provider not available.',
              metadata: { sequence: 0, timestamp: new Date().toISOString() },
            };
          },
        },
        eventBus: this.eventBus,
        logger: this.logger,
      });

      await conversation.createConversation(fingerprint.id);
      await WorkspaceManifest.touch(workspaceDir);

      const { DefaultMemoryRuntime } = await import('@vestara/memory');
      const memoryRuntime = new DefaultMemoryRuntime({
        logger: this.logger,
        eventBus: this.eventBus,
      });
      const memDbPath = path.join(workspaceDir, 'memory', 'memories.db');
      let memDb: any;
      try {
        const { getSql } = await import('@vestara/shared');
        const SQL = await getSql();
        if (fs.existsSync(memDbPath)) {
          const buffer = fs.readFileSync(memDbPath);
          memDb = new SQL.Database(buffer);
        } else {
          memDb = new SQL.Database();
        }
      } catch {
        const { getSql } = await import('@vestara/shared');
        const SQL = await getSql();
        memDb = new SQL.Database();
      }
      await memoryRuntime.initialize(memDb);
      await memoryRuntime.store('workspace', {
        type: 'fact',
        content: `Working on repository: ${fingerprint.name}`,
        tags: ['workspace', 'identity'],
        source: 'workspace',
        metadata: { repositoryId: fingerprint.id, path: fingerprint.canonicalPath },
      });

      // Transition to ready before indexing
      this.transition('ready');

      // ── Stage 5: Index (deferred — runs in background) ────
      const deferredIndex = this.runIndex(
        resolvedPath,
        workspaceDir,
        fingerprint,
        isCached,
        existingManifest,
        clockTime,
        startTime,
        timings,
        filesChanged,
      );

      // Wrap the deferred promise so the session can await it
      let resolveKnowledgeReady: () => void;
      const knowledgeReady = new Promise<void>((resolve) => {
        resolveKnowledgeReady = resolve;
      });
      deferredIndex.then(() => resolveKnowledgeReady!()).catch(() => resolveKnowledgeReady!());

      // Create session with knowledgeReady promise
      let sessionKnowledgeEngine: any;
      const sessionIndexReport = stubIndex;
      try {
        const { DefaultKnowledgeEngine, KnowledgeStorage } = await import('@vestara/knowledge');
        const dbPath = path.join(workspaceDir, 'knowledge', 'chunks.db');
        let knowledgeDb: any;
        const { getSql } = await import('@vestara/shared');
        const SQL = await getSql();
        if (fs.existsSync(dbPath)) {
          const buffer = fs.readFileSync(dbPath);
          knowledgeDb = new SQL.Database(buffer);
        } else {
          knowledgeDb = new SQL.Database();
        }
        const storage = new KnowledgeStorage(knowledgeDb);
        sessionKnowledgeEngine = new DefaultKnowledgeEngine({
          storage,
          logger: this.logger,
          eventBus: this.eventBus,
        });
      } catch {
        // knowledge engine not available — consumer will await knowledgeReady to get it
      }

      // Start file monitor for live updates
      this.startMonitor(resolvedPath, sessionKnowledgeEngine);

      // Initialize preference service
      const { PreferenceService } = await import('./preference-service.js');
      const prefsDbPath = path.join(workspaceDir, 'prefs.db');
      let prefsDb: any;
      try {
        const { getSql } = await import('@vestara/shared');
        const SQL = await getSql();
        if (fs.existsSync(prefsDbPath)) {
          const buffer = fs.readFileSync(prefsDbPath);
          prefsDb = new SQL.Database(buffer);
        } else {
          prefsDb = new SQL.Database();
        }
      } catch {
        const { getSql } = await import('@vestara/shared');
        const SQL = await getSql();
        prefsDb = new SQL.Database();
      }
      migrate(prefsDb, PREFERENCES_MANIFEST, {
        persist: (migrated) => {
          try {
            fs.mkdirSync(path.dirname(prefsDbPath), { recursive: true });
            fs.writeFileSync(prefsDbPath, Buffer.from(migrated.export()));
          } catch {
            /* best effort */
          }
        },
      });
      const prefs = new PreferenceService(prefsDb);
      prefs.onPersist(() => {
        try {
          const data = prefsDb.export();
          fs.mkdirSync(path.dirname(prefsDbPath), { recursive: true });
          fs.writeFileSync(prefsDbPath, Buffer.from(data));
        } catch {
          /* best effort */
        }
      });
      this._persistPrefs = () => {
        try {
          const data = prefsDb.export();
          fs.mkdirSync(path.dirname(prefsDbPath), { recursive: true });
          fs.writeFileSync(prefsDbPath, Buffer.from(data));
        } catch {
          /* best effort */
        }
      };

      // Seed model/provider from manifest's provider registry if available
      try {
        if (manifest?.providers && manifest.providers.length > 0) {
          const enabledProvider = manifest.providers.find((p: any) => p.enabled);
          if (enabledProvider) {
            const currentProvider = prefs.get('provider');
            if (currentProvider === 'opencode' || !manifest.providers.find((p: any) => p.id === currentProvider)) {
              prefs.set('provider', enabledProvider.id);
            }
            const enabledModel = enabledProvider.models.find((m: any) => m.enabled);
            if (enabledModel) {
              prefs.set('model', enabledModel.id);
            }
          }
        }
      } catch {
        /* best effort — provider registry is optional */
      }

      this.session = new WorkspaceSession({
        rootPath: resolvedPath,
        workspaceDir,
        fingerprint,
        profile: this.workspace.analysis!,
        manifest,
        knowledge: sessionKnowledgeEngine,
        knowledgeReady,
        memory: memoryRuntime,
        conversation,
        prefs,
        indexReport: sessionIndexReport,
      });

      // ── Understanding (after session, before return) ──
      {
        const engine = new DefaultUnderstandingEngine(this.session);
        this.session.setEngine(engine);
        try {
          const observation = await engine.observe();
          const understanding = await engine.understand(observation);
          this.session.publishUnderstanding(understanding);
          contextAssembler.setUnderstanding(understanding);
          this.logger?.info('Workspace understanding produced', {
            id: understanding.id,
            language: understanding.identity.primaryLanguage,
            maturity: understanding.maturity.level,
          });
        } catch (err) {
          this.logger?.warn('Understanding production failed (graceful)', { error: err });
        }
      }

      await this.emit('workspace:understood', {
        understandingId: this.session.understanding?.id ?? null,
        workspaceName: fingerprint.name,
      });

      const wallDuration = Date.now() - clockTime;
      this.logger?.info('Workspace ready', {
        name: fingerprint.name,
        duration: `${wallDuration}ms`,
        deferredIndex: true,
      });
      timings.session = Math.round(performance.now() - t0);
      timings.total = Math.round(performance.now() - startTime);
      const duration = wallDuration;

      this.logger?.info('Stage timings (fast path)', {
        discover: `${timings.discover}ms`,
        fingerprint: `${timings.fingerprint}ms`,
        analyze: `${timings.analyze}ms`,
        present: `${timings.present}ms`,
        session: `${timings.session}ms`,
        total: `${timings.total}ms`,
        index: 'deferred (background)',
      });

      await this.emit('workspace:ready', {
        name: fingerprint.name,
        duration,
        timings,
        deferredIndex: true,
      });

      return {
        workspace: { ...this.workspace },
        duration,
        timings,
        deferredIndex: true,
      };
    } catch (error) {
      this.status = 'error';
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.workspace.status = 'error';
      this.workspace.error = message;
      this.logger?.error('Workspace open failed', { errorMessage: message });
      await this.emit('workspace:error', { error: message });
      throw error;
    }
  }

  /**
   * Close the workspace and persist state.
   */
  async close(): Promise<void> {
    if (this.session) {
      try {
        await this.session.memory.consolidate('workspace');
        await this.session.persist();
        // Persist preferences to disk
        if (this._persistPrefs) this._persistPrefs();
      } catch (error) {
        this.logger?.warn('Error during workspace close', { error });
      }
      this.session = null;
    }
    this.status = 'idle';
    this.workspace = {
      identity: null,
      discovery: null,
      analysis: null,
      index: null,
      presentation: null,
      status: 'idle',
    };
  }

  getSession(): WorkspaceSession {
    if (!this.session) throw new Error('No active workspace session');
    return this.session;
  }

  /**
   * Run indexing asynchronously after workspace is ready.
   */
  private async runIndex(
    resolvedPath: string,
    workspaceDir: string,
    _fingerprint: any,
    isCached: boolean,
    existingManifest: any,
    _clockTime: number,
    _startTime: number,
    timings: any,
    changedFiles?: string[],
  ): Promise<void> {
    this.transition('deferred-index');
    const t0 = performance.now();
    try {
      const { DefaultKnowledgeEngine, KnowledgeStorage } = await import('@vestara/knowledge');

      const dbPath = path.join(workspaceDir, 'knowledge', 'chunks.db');
      let knowledgeDb: any;
      const { getSql } = await import('@vestara/shared');
      const SQL = await getSql();
      if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        knowledgeDb = new SQL.Database(buffer);
      } else {
        knowledgeDb = new SQL.Database();
      }

      const storage = new KnowledgeStorage(knowledgeDb);
      const knowledgeEngine = new DefaultKnowledgeEngine({
        storage,
        logger: this.logger,
        eventBus: this.eventBus,
      });

      let indexReport;
      if (isCached && existingManifest?.knowledge?.lastIndexedAt) {
        if (changedFiles && changedFiles.length > 0) {
          this.logger?.info(`Incremental reindex: ${changedFiles.length} changed files`);
          indexReport = await knowledgeEngine.index(resolvedPath, changedFiles);
        } else {
          indexReport = { documentsIndexed: 0, chunksCreated: 0, duration: 0 };
          this.logger?.info('Knowledge index is up to date, skipping');
        }
      } else {
        indexReport = await knowledgeEngine.index(resolvedPath);
        const data = knowledgeDb.export();
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, Buffer.from(data));

        await WorkspaceManifest.updateKnowledge(workspaceDir, {
          documents: indexReport.documentsIndexed,
          chunks: indexReport.chunksCreated,
        });

        this.logger?.info('Indexing completed (deferred)', {
          documents: indexReport.documentsIndexed,
          chunks: indexReport.chunksCreated,
          duration: `${indexReport.duration}ms`,
        });
      }

      this.workspace.index = indexReport;
      timings.index = Math.round(performance.now() - t0);

      if (this.session) {
        (this.session as any).knowledgeEngine = knowledgeEngine;
        (this.session as any).indexReport = indexReport;
      }

      await this.emit('workspace:index.completed', {
        documents: indexReport.documentsIndexed,
        chunks: indexReport.chunksCreated,
      });

      this.transition('ready');
    } catch (error: any) {
      this.logger?.error('Deferred indexing failed', { error });
      await this.emit('workspace:index.error', { error: String(error) });
      this.transition('ready');
    }
  }

  /**
   * Start MonitorService to watch for file changes after open.
   */
  private async startMonitor(_rootDir: string, _knowledgeEngine?: any): Promise<void> {
    if (!this.session) return;
    try {
      const { MonitorService } = await import('./monitor-service.js');
      const { KnowledgeGraphStorage } = await import('./knowledge-graph-storage.js');
      const { getSql } = await import('@vestara/shared');
      const SQL = await getSql();
      const db = new SQL.Database();
      const graph = new KnowledgeGraphStorage(db);
      const monitor = new MonitorService(this.session, graph, this.session.knowledge as any);
      await monitor.start();
      this.logger?.info('File monitor started');
    } catch {
      this.logger?.warn('File monitor not available');
    }
  }

  private transition(status: WorkspaceStatus): void {
    this.status = status;
    this.workspace.status = status;
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.eventBus?.emit({
      type,
      source: 'workspace-runtime',
      payload,
      metadata: {
        correlationId: this.workspace.identity?.id ?? 'unknown',
        causationId: 'workspace-runtime',
        retryCount: 0,
        ttl: 30000,
      },
    });
  }
}
