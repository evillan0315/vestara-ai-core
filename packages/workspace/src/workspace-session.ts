/**
 * WorkspaceSession — The active workspace context.
 *
 * Holds all engine references for the opened repository. Every REPL
 * command, REST API call, or IDE request operates through this session.
 * The session is created once by WorkspaceRuntime.open() and remains
 * valid until close().
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Foundation: RepositoryWorkspace, VOM
 *   Runtime: Kernel Lifecycle
 */

import type { ConversationService } from '@vestara/conversation';
import type { KnowledgeEngine, SearchResult } from '@vestara/knowledge';
import type { Memory, MemoryRuntime } from '@vestara/memory';
import type { WorkspaceUnderstanding, UnderstandingEngine } from '@vestara/understanding';
import type { PreferenceService } from './preference-service';
import type { RepositoryFingerprint } from './repository-fingerprint';
import type { RepositoryProfile } from './types';
import type { WorkspaceManifestData } from './workspace-manifest';

export class WorkspaceSession {
  readonly rootPath: string;
  readonly workspaceDir: string;
  readonly fingerprint: RepositoryFingerprint;
  readonly profile: RepositoryProfile;
  readonly manifest: WorkspaceManifestData;
  readonly knowledge: KnowledgeEngine | undefined;
  readonly knowledgeReady: Promise<void>;
  readonly memory: MemoryRuntime;
  readonly conversation: ConversationService;
  readonly prefs: PreferenceService;
  private _engine: UnderstandingEngine | null = null;
  indexReport: { documentsIndexed: number; chunksCreated: number; duration: number };
  private _understanding: WorkspaceUnderstanding | null = null;

  constructor(opts: {
    rootPath: string;
    workspaceDir: string;
    fingerprint: RepositoryFingerprint;
    profile: RepositoryProfile;
    manifest: WorkspaceManifestData;
    knowledge?: KnowledgeEngine;
    knowledgeReady?: Promise<void>;
    memory: MemoryRuntime;
    conversation: ConversationService;
    prefs: PreferenceService;
    engine?: UnderstandingEngine;
    indexReport?: { documentsIndexed: number; chunksCreated: number; duration: number };
  }) {
    this.rootPath = opts.rootPath;
    this.workspaceDir = opts.workspaceDir;
    this.fingerprint = opts.fingerprint;
    this.profile = opts.profile;
    this.manifest = opts.manifest;
    this.knowledge = opts.knowledge;
    this.knowledgeReady = opts.knowledgeReady ?? Promise.resolve();
    this.memory = opts.memory;
    this.conversation = opts.conversation;
    this.prefs = opts.prefs;
    this._engine = opts.engine ?? null;
    this.indexReport = opts.indexReport ?? { documentsIndexed: 0, chunksCreated: 0, duration: 0 };
  }

  get engine(): UnderstandingEngine {
    if (!this._engine) throw new Error('UnderstandingEngine not initialized');
    return this._engine;
  }

  setEngine(engine: UnderstandingEngine): void {
    this._engine = engine;
  }

  /**
   * The current WorkspaceUnderstanding snapshot.
   * Null until the first observation cycle completes.
   */
  get understanding(): WorkspaceUnderstanding | null {
    return this._understanding;
  }

  /**
   * Publish a new understanding snapshot.
   * Called by WorkspaceRuntime after each observation cycle.
   */
  publishUnderstanding(understanding: WorkspaceUnderstanding): void {
    this._understanding = understanding;
  }

  /**
   * Returns true once the knowledge index has been fully built.
   */
  get isIndexReady(): boolean {
    return this.indexReport.documentsIndexed > 0 || this.indexReport.duration === 0;
  }

  /**
   * Search the indexed knowledge base for this workspace.
   * Awaits deferred indexing if it hasn't completed yet.
   */
  async search(query: string, limit?: number): Promise<SearchResult[]> {
    await this.knowledgeReady;
    if (!this.knowledge) return [];
    return this.knowledge.search(query, limit);
  }

  /**
   * Get workspace-scoped memories for context assembly.
   */
  async getContextMemories(limit?: number): Promise<Memory[]> {
    return this.memory.getContext('workspace', limit);
  }

  /**
   * Store a memory in the workspace context.
   */
  async storeMemory(type: 'fact' | 'preference' | 'event' | 'decision', content: string): Promise<Memory> {
    return this.memory.store('workspace', { type, content, source: 'workspace' });
  }

  /**
   * Persist current state to .vestara/.
   */
  async persist(): Promise<void> {
    // Knowledge is auto-persisted by KnowledgeEngine (SQLite)
    // Memory is auto-persisted by MemoryRuntime (SQLite)
    // Manifest is updated separately by WorkspaceManifest
  }
}
