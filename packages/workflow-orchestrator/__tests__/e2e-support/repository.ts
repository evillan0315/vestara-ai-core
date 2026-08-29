/**
 * WFO-E2E temporary repository.
 *
 * An isolated, disposable filesystem workspace with deterministic repo identity.
 * Each scenario uses a fresh repository; generated files are removed on dispose.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export class TemporaryRepository {
  readonly root: string;
  /** Deterministic repository identity for layer-2 scenarios (no real git). */
  readonly baselineSha = 'e2e-baseline-sha-0001';
  readonly currentSha = 'e2e-current-sha-0002';

  constructor(prefix = 'vestara-e2e-repo-') {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  write(relative: string, content: string): string {
    const target = path.join(this.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    return relative;
  }

  read(relative: string): string | undefined {
    const target = path.join(this.root, relative);
    return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
  }

  exists(relative: string): boolean {
    return fs.existsSync(path.join(this.root, relative));
  }

  dispose(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}
