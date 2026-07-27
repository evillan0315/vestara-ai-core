/**
 * CollaborationService — Governance layer for engineering artifacts.
 *
 * Introduces human review lifecycle around Change Sets.
 * AI may propose. Humans approve. System records.
 *
 * Architecture Traceability:
 *   PCS: PCS-006 — Collaboration
 *   Product Principle: Evolve Intelligence Before Autonomy
 *   Safety: AI may never approve its own changes
 */

import type { CollaborationStorage } from './collaboration-storage';
import type { PluginRuntime } from './plugin-runtime';
import type { Approval, CollaborationComment, CollaborationRecord, ReviewStatus } from './types';
import type { WorkspaceSession } from './workspace-session';

export class CollaborationService {
  private storage: CollaborationStorage;
  private pluginRuntime?: PluginRuntime;

  constructor(opts: { storage: CollaborationStorage; pluginRuntime?: PluginRuntime }) {
    this.storage = opts.storage;
    this.pluginRuntime = opts.pluginRuntime;
  }

  /**
   * Submit a Change Set for review. Creates a CollaborationRecord.
   */
  async submit(changeSetId: string, planId: string, session: WorkspaceSession): Promise<CollaborationRecord> {
    // Check if a record already exists for this change set
    const existing = await this.storage.listByWorkspace(session.fingerprint.id);
    const found = existing.find((r) => r.changeSetId === changeSetId);
    if (found) throw new Error(`Change Set "${changeSetId}" already has a collaboration record (${found.id}).`);

    const record = await this.storage.create(changeSetId, planId, session.fingerprint.id);
    await this.storage.updateStatus(record.id, 'submitted');
    record.status = 'submitted';
    return record;
  }

  /**
   * Record an approval decision. Append-only — never overwrites previous decisions.
   */
  async approve(recordId: string, reviewer: string, comment?: string): Promise<CollaborationRecord> {
    const record = await this.storage.get(recordId);
    if (!record) throw new Error(`Collaboration record "${recordId}" not found.`);

    const validStates: ReviewStatus[] = ['submitted', 'reviewing'];
    if (!validStates.includes(record.status)) {
      throw new Error(
        `Cannot approve record in "${record.status}" status. Only "submitted" or "reviewing" can be approved.`,
      );
    }

    const approval: Approval = {
      id: `APR-${Date.now()}-${record.approvals.length}`,
      reviewer,
      decision: 'approve',
      comment,
      createdAt: new Date().toISOString(),
    };

    await this.storage.addApproval(recordId, approval);
    record.approvals.push(approval);
    record.updatedAt = new Date().toISOString();

    // Check if all reviewers have approved
    const allReviewed = record.ownership.reviewers.every((r) =>
      record.approvals.some((a) => a.reviewer === r && a.decision === 'approve'),
    );

    const newStatus: ReviewStatus = allReviewed ? 'approved' : 'reviewing';
    await this.storage.updateStatus(recordId, newStatus);
    record.status = newStatus;

    // Fire after-approve plugin hooks when fully approved
    if (allReviewed && this.pluginRuntime) {
      try {
        this.pluginRuntime.executeHook('after-approve', null as any).catch(() => {});
      } catch {
        /* best effort */
      }
    }

    return record;
  }

  /**
   * Reject a submission.
   */
  async reject(recordId: string, reviewer: string, reason: string): Promise<CollaborationRecord> {
    const record = await this.storage.get(recordId);
    if (!record) throw new Error(`Collaboration record "${recordId}" not found.`);

    const validStates: ReviewStatus[] = ['submitted', 'reviewing'];
    if (!validStates.includes(record.status)) {
      throw new Error(`Cannot reject record in "${record.status}" status.`);
    }

    const approval: Approval = {
      id: `APR-${Date.now()}-${record.approvals.length}`,
      reviewer,
      decision: 'reject',
      comment: reason,
      createdAt: new Date().toISOString(),
    };

    await this.storage.addApproval(recordId, approval);
    await this.storage.updateStatus(recordId, 'rejected');
    record.approvals.push(approval);
    record.status = 'rejected';
    record.updatedAt = new Date().toISOString();

    return record;
  }

  /**
   * Add a comment to a collaboration record.
   */
  async comment(
    recordId: string,
    author: string,
    message: string,
    artifactType?: 'plan' | 'changeset' | 'verification',
    artifactId?: string,
  ): Promise<CollaborationComment> {
    const record = await this.storage.get(recordId);
    if (!record) throw new Error(`Collaboration record "${recordId}" not found.`);

    const comment: CollaborationComment = {
      id: `CMT-${Date.now()}`,
      artifactType: artifactType ?? 'changeset',
      artifactId: artifactId ?? record.changeSetId,
      author,
      message,
      createdAt: new Date().toISOString(),
    };

    await this.storage.addComment(recordId, comment);
    return comment;
  }

  /**
   * Get a collaboration record by ID.
   */
  async getRecord(id: string): Promise<CollaborationRecord | null> {
    return this.storage.get(id);
  }

  /**
   * List all collaboration records in the workspace.
   */
  async listRecords(workspaceId: string): Promise<CollaborationRecord[]> {
    return this.storage.listByWorkspace(workspaceId);
  }

  /**
   * Mark a collaboration record as completed.
   */
  async complete(recordId: string): Promise<CollaborationRecord> {
    const record = await this.storage.get(recordId);
    if (!record) throw new Error(`Collaboration record "${recordId}" not found.`);
    if (record.status !== 'approved') {
      throw new Error(`Only approved records can be completed. Current status: "${record.status}".`);
    }
    await this.storage.updateStatus(recordId, 'completed');
    record.status = 'completed';
    record.updatedAt = new Date().toISOString();
    return record;
  }

  /**
   * Render a collaboration record for terminal display.
   */
  renderRecord(record: CollaborationRecord): string {
    const lines: string[] = [];
    lines.push(`Collaboration Record ${record.id}`);
    lines.push(`──────────────────────────────────────`);
    lines.push(`Change Set: ${record.changeSetId}`);
    lines.push(`Plan: ${record.planId}`);
    if (record.verificationId) lines.push(`Verification: ${record.verificationId}`);
    lines.push(`Status: ${record.status}`);
    lines.push(`Created: ${record.createdAt}`);
    lines.push(`Updated: ${record.updatedAt}`);
    lines.push('');

    if (record.approvals.length > 0) {
      lines.push('Approvals:');
      for (const a of record.approvals) {
        const icon = a.decision === 'approve' ? '✓' : '✗';
        lines.push(`  ${icon} ${a.reviewer} — ${a.decision}${a.comment ? `: "${a.comment}"` : ''}`);
        lines.push(`     ${a.createdAt}`);
      }
      lines.push('');
    }

    if (record.comments.length > 0) {
      lines.push('Comments:');
      for (const c of record.comments) {
        lines.push(`  • ${c.author}: "${c.message}"`);
        lines.push(`     ${c.createdAt}`);
      }
      lines.push('');
    }

    lines.push(`Ownership:`);
    lines.push(`  Owner: ${record.ownership.owner}`);
    if (record.ownership.reviewers.length > 0) {
      lines.push(`  Reviewers: ${record.ownership.reviewers.join(', ')}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Render a compact list of records.
   */
  renderList(records: CollaborationRecord[]): string {
    if (records.length === 0) return 'No collaboration records.';
    const lines: string[] = [];
    lines.push('Collaboration Records:');
    lines.push('');
    for (const r of records) {
      const aprCount = r.approvals.filter((a) => a.decision === 'approve').length;
      const totalReviewers = r.ownership.reviewers.length;
      lines.push(
        `  ${r.id.padEnd(6)} ${r.status.padEnd(12)} CS:${r.changeSetId} (${aprCount}/${totalReviewers} approved)`,
      );
    }
    return lines.join('\n');
  }
}
