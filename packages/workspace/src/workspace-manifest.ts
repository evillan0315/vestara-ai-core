/**
 * WorkspaceManifest — Persistence layer for .vestara/workspace.json
 *
 * Manages the on-disk workspace state. The manifest is the canonical
 * root for everything related to a repository: identity, analysis,
 * knowledge index state, memory state, and active session info.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Foundation: RepositoryWorkspace, VOM
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RepositoryFingerprint } from './repository-fingerprint';
import type { RepositoryProfile } from './types';

const MANIFEST_FILENAME = 'workspace.json';
const SCHEMA_VERSION = 1;

export interface ModelConfig {
  id: string;
  name: string;
  enabled: boolean;
  contextWindow: number;
  maxOutput: number;
  capabilities: {
    chat: boolean;
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
  };
  pricing?: {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  enabled: boolean;
  models: ModelConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceManifestData {
  schemaVersion: number;
  id: string;
  name: string;
  fingerprint: RepositoryFingerprint;
  analysis: RepositoryProfile;
  knowledge: {
    version: number;
    documents: number;
    chunks: number;
    lastIndexedAt: string | null;
  };
  memory: {
    version: number;
    count: number;
    lastConsolidatedAt: string | null;
  };
  files?: {
    count: number;
    totalSizeKB: number;
    byExtension: Record<string, number>;
    mtimeCache: Record<string, string>;
  };
  narrativeCache?: {
    purpose: string;
    suggestedStartingPoints: string[];
    keyObservations: string[];
    cachedAt: string;
  } | null;
  providers?: ProviderConfig[];
  openedAt: string;
  lastOpenedAt: string;
}

export class WorkspaceManifest {
  /**
   * Get the absolute path to the manifest file.
   */
  static manifestPath(workspaceDir: string): string {
    return path.join(workspaceDir, MANIFEST_FILENAME);
  }

  /**
   * Create a new manifest directory and write initial state.
   */
  static async create(
    workspaceDir: string,
    fingerprint: RepositoryFingerprint,
    analysis: RepositoryProfile,
  ): Promise<WorkspaceManifestData> {
    // Ensure directory exists
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'knowledge'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'memory'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'sessions'), { recursive: true });

    const now = new Date().toISOString();
    const data: WorkspaceManifestData = {
      schemaVersion: SCHEMA_VERSION,
      id: fingerprint.id,
      name: fingerprint.name,
      fingerprint,
      analysis,
      knowledge: { version: 1, documents: 0, chunks: 0, lastIndexedAt: null },
      memory: { version: 1, count: 0, lastConsolidatedAt: null },
      openedAt: now,
      lastOpenedAt: now,
    };

    await WorkspaceManifest.save(workspaceDir, data);
    return data;
  }

  /**
   * Load the manifest from disk.
   */
  static async load(workspaceDir: string): Promise<WorkspaceManifestData | null> {
    const fp = WorkspaceManifest.manifestPath(workspaceDir);
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      return JSON.parse(raw) as WorkspaceManifestData;
    } catch {
      return null;
    }
  }

  /**
   * Save manifest to disk.
   */
  static async save(workspaceDir: string, data: WorkspaceManifestData): Promise<void> {
    const fp = WorkspaceManifest.manifestPath(workspaceDir);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Check whether the cached manifest is stale compared to current fingerprint.
   */
  static isStale(manifest: WorkspaceManifestData, currentFingerprint: RepositoryFingerprint): boolean {
    return manifest.fingerprint.repositoryHash !== currentFingerprint.repositoryHash;
  }

  /**
   * Update manifest with new knowledge index stats.
   */
  static async updateKnowledge(workspaceDir: string, stats: { documents: number; chunks: number }): Promise<void> {
    const manifest = await WorkspaceManifest.load(workspaceDir);
    if (!manifest) return;
    manifest.knowledge = {
      version: manifest.knowledge.version + 1,
      documents: stats.documents,
      chunks: stats.chunks,
      lastIndexedAt: new Date().toISOString(),
    };
    manifest.lastOpenedAt = new Date().toISOString();
    await WorkspaceManifest.save(workspaceDir, manifest);
  }

  /**
   * Cache AI-generated narrative so re-opens skip the API call.
   */
  static async cacheNarrative(
    workspaceDir: string,
    narrative: { purpose: string; suggestedStartingPoints: string[]; keyObservations: string[] } | null,
  ): Promise<void> {
    const manifest = await WorkspaceManifest.load(workspaceDir);
    if (!manifest) return;
    manifest.narrativeCache = narrative ? { ...narrative, cachedAt: new Date().toISOString() } : null;
    await WorkspaceManifest.save(workspaceDir, manifest);
  }

  /**
   * Load cached narrative from manifest.
   */
  static loadCachedNarrative(
    manifest: WorkspaceManifestData,
  ): { purpose: string; suggestedStartingPoints: string[]; keyObservations: string[] } | null {
    return manifest.narrativeCache ?? null;
  }

  /**
   * Update the lastOpenedAt timestamp.
   */
  static async touch(workspaceDir: string): Promise<void> {
    const manifest = await WorkspaceManifest.load(workspaceDir);
    if (!manifest) return;
    manifest.lastOpenedAt = new Date().toISOString();
    await WorkspaceManifest.save(workspaceDir, manifest);
  }

  /**
   * Update file tracking data for incremental re-open detection.
   */
  static async updateFiles(
    workspaceDir: string,
    files: {
      count: number;
      totalSizeKB: number;
      byExtension: Record<string, number>;
      mtimeCache: Record<string, string>;
    },
  ): Promise<void> {
    const manifest = await WorkspaceManifest.load(workspaceDir);
    if (!manifest) return;
    manifest.files = files;
    manifest.lastOpenedAt = new Date().toISOString();
    await WorkspaceManifest.save(workspaceDir, manifest);
  }

  /**
   * Detect which files changed between two mtime caches.
   * Returns relative paths of files that were added, removed, or modified.
   */
  static detectChangedFiles(current: Record<string, string>, previous: Record<string, string>): string[] {
    const changed: string[] = [];
    const allKeys = new Set([...Object.keys(current), ...Object.keys(previous)]);
    for (const key of allKeys) {
      if (current[key] !== previous[key]) {
        changed.push(key);
      }
    }
    return changed;
  }
}
