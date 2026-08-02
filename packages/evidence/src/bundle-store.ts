/**
 * BundleStore — persists finalized VerificationEvidenceBundles so the Workspace
 * evidence viewer (and replay) can read them back. Keyed by executionId
 * (filesystem-safe); a finalized bundle is never overwritten.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VerificationEvidenceBundle } from './types';

export class BundleStore {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  write(bundle: VerificationEvidenceBundle): void {
    if (!/^[a-zA-Z0-9._-]+$/.test(bundle.executionId)) {
      throw new Error(`Unsafe evidence execution id: ${bundle.executionId}`);
    }
    fs.mkdirSync(this.directory, { recursive: true });
    const target = this.pathFor(bundle.executionId);
    if (fs.existsSync(target)) {
      throw new Error(`Evidence bundle is immutable: ${bundle.executionId}`);
    }
    fs.writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' });
  }

  read(executionId: string): VerificationEvidenceBundle | undefined {
    const target = this.pathFor(executionId);
    if (!fs.existsSync(target)) return undefined;
    return JSON.parse(fs.readFileSync(target, 'utf8')) as VerificationEvidenceBundle;
  }

  list(): VerificationEvidenceBundle[] {
    if (!fs.existsSync(this.directory)) return [];
    return fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.directory, file), 'utf8')) as VerificationEvidenceBundle)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private pathFor(executionId: string): string {
    return path.join(this.directory, `${executionId}.json`);
  }
}
