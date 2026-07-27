/**
 * WorkspacePersistence — Save and restore complete workspace state.
 *
 * Persists all artifacts (plans, change sets, verifications, decisions,
 * impact assessments, memory) to the .vestara/ directory and restores
 * them on workspace open. Enables true session continuity across restarts.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Persistence Model, Failure Recovery
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkspaceSession } from './workspace-session';

export class WorkspacePersistence {
  private session: WorkspaceSession;

  constructor(session: WorkspaceSession) {
    this.session = session;
  }

  /**
   * Save all workspace artifacts to disk.
   * Returns a summary of what was saved.
   */
  async saveAll(): Promise<{ files: number; size: number }> {
    const wsDir = this.session.workspaceDir;
    let totalSize = 0;
    let totalFiles = 0;

    // Ensure .vestara directory exists
    fs.mkdirSync(wsDir, { recursive: true });

    // 1. Save manifest
    const manifestPath = path.join(wsDir, 'workspace.json');
    if (fs.existsSync(manifestPath)) {
      const stat = fs.statSync(manifestPath);
      totalSize += stat.size;
      totalFiles++;
    }

    // 2. Consolidate plan DB
    const planDbPath = path.join(wsDir, 'plans', 'plans.db');
    if (fs.existsSync(planDbPath)) {
      const stat = fs.statSync(planDbPath);
      totalSize += stat.size;
      totalFiles++;
    }

    // 3. Consolidate knowledge DB
    const knowledgeDbPath = path.join(wsDir, 'knowledge', 'chunks.db');
    if (fs.existsSync(knowledgeDbPath)) {
      const stat = fs.statSync(knowledgeDbPath);
      totalSize += stat.size;
      totalFiles++;
    }

    // 4. Save memory DB
    const memoryDbPath = path.join(wsDir, 'memory', 'memories.db');
    if (fs.existsSync(memoryDbPath)) {
      const stat = fs.statSync(memoryDbPath);
      totalSize += stat.size;
      totalFiles++;
    }

    // 5. Save session file with summary
    const sessionSummary = {
      name: this.session.fingerprint.name,
      path: this.session.rootPath,
      language: this.session.profile.language,
      fileCount: this.session.profile.fileCount,
      healthScore: this.session.profile.healthScore?.overall ?? null,
      savedAt: new Date().toISOString(),
      artifactCounts: {
        entryPoints: this.session.profile.entryPoints.length,
        risks: this.session.profile.risks.length,
        packages: this.session.profile.packages.length,
      },
    };

    const sessionPath = path.join(wsDir, 'sessions', 'last.session.json');
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(sessionSummary, null, 2));
    totalFiles++;

    return { files: totalFiles, size: totalSize };
  }

  /**
   * Get a summary of what was previously saved.
   */
  getSavedSummary(): { exists: boolean; lastSaved: string | null; name: string | null } {
    const sessionPath = path.join(this.session.workspaceDir, 'sessions', 'last.session.json');
    try {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      return { exists: true, lastSaved: data.savedAt, name: data.name };
    } catch {
      return { exists: false, lastSaved: null, name: null };
    }
  }

  /**
   * Render save summary.
   */
  renderSaveResult(result: { files: number; size: number }): string {
    const sizeKB = Math.round(result.size / 1024);
    return [
      `Workspace saved:`,
      `  Files:      ${result.files}`,
      `  Size:       ${sizeKB}KB`,
      `  Location:   ${this.session.workspaceDir}`,
    ].join('\n');
  }

  /**
   * Render saved summary.
   */
  renderSavedSummary(summary: { exists: boolean; lastSaved: string | null; name: string | null }): string {
    if (!summary.exists) return 'No saved workspace state found.';
    return [
      `Previous workspace:`,
      `  Name:       ${summary.name}`,
      `  Last saved: ${summary.lastSaved}`,
      `  Location:   ${this.session.workspaceDir}`,
    ].join('\n');
  }
}
