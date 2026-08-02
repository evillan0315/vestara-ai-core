/**
 * PCS-026 §9 — human-reviewed visual baselines.
 *
 * Baselines are a governance artifact: they are only promoted through an
 * explicit approve/reject action (a human or a governance endpoint), never by a
 * collector. Persisted as JSON alongside the manifest store.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BaselineStatus } from './types';

export interface BaselineRecord {
  readonly scenarioKey: string;
  readonly artifactDigest: string;
  readonly status: BaselineStatus;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  /** Candidate digest awaiting review (when status is 'missing'). */
  readonly candidateDigest?: string;
}

export class BaselineStore {
  private readonly file: string;

  constructor(directory: string) {
    this.file = path.join(directory, 'baselines.json');
  }

  get(scenarioKey: string): BaselineRecord | undefined {
    return this.read()[scenarioKey];
  }

  /** Record a candidate screenshot awaiting human review. */
  recordCandidate(scenarioKey: string, candidateDigest: string): BaselineRecord {
    const map = this.read();
    const existing = map[scenarioKey];
    const record: BaselineRecord = existing
      ? { ...existing, candidateDigest }
      : {
          scenarioKey,
          artifactDigest: '',
          status: 'missing',
          candidateDigest,
        };
    map[scenarioKey] = record;
    this.write(map);
    return record;
  }

  /** Governance action — promote a candidate to the approved baseline. */
  approve(scenarioKey: string, artifactDigest: string, approvedBy: string): BaselineRecord {
    const map = this.read();
    const record: BaselineRecord = {
      scenarioKey,
      artifactDigest,
      status: 'approved',
      approvedBy,
      approvedAt: new Date().toISOString(),
    };
    map[scenarioKey] = record;
    this.write(map);
    return record;
  }

  /** Governance action — reject a candidate; it is retained but not promoted. */
  reject(scenarioKey: string, approvedBy: string): BaselineRecord {
    const map = this.read();
    const existing = map[scenarioKey];
    const record: BaselineRecord = {
      scenarioKey,
      artifactDigest: existing?.artifactDigest ?? '',
      status: 'rejected',
      approvedBy,
      approvedAt: new Date().toISOString(),
      candidateDigest: existing?.candidateDigest,
    };
    map[scenarioKey] = record;
    this.write(map);
    return record;
  }

  list(): BaselineRecord[] {
    return Object.values(this.read()).sort((a, b) => a.scenarioKey.localeCompare(b.scenarioKey));
  }

  private read(): Record<string, BaselineRecord> {
    if (!fs.existsSync(this.file)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, BaselineRecord>;
    } catch {
      return {};
    }
  }

  private write(map: Record<string, BaselineRecord>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(map, null, 2)}\n`);
  }
}
