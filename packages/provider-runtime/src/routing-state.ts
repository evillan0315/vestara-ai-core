import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EngineeringRoutingSelection, VersionedRoutingSelection } from './routing-types.js';
import { RoutingConflictError } from './routing-types.js';

export class VersionedRoutingStore {
  private current: VersionedRoutingSelection;

  constructor(initial: EngineeringRoutingSelection, clientId = 'system', now = new Date()) {
    this.current = {
      revision: 0,
      updatedAt: now.toISOString(),
      updatedByClientId: clientId,
      selection: initial,
    };
  }

  get(): VersionedRoutingSelection {
    return structuredClone(this.current);
  }

  update(
    selection: EngineeringRoutingSelection,
    expectedRevision: number,
    updatedByClientId: string,
    now = new Date(),
  ): VersionedRoutingSelection {
    if (expectedRevision !== this.current.revision) {
      throw new RoutingConflictError(expectedRevision, this.get());
    }

    this.current = {
      revision: this.current.revision + 1,
      updatedAt: now.toISOString(),
      updatedByClientId,
      selection: structuredClone(selection),
    };
    return this.get();
  }
}

export class FileRoutingStore {
  private readonly store: VersionedRoutingStore;

  constructor(
    private readonly filePath: string,
    initial: EngineeringRoutingSelection,
    clientId = 'system',
  ) {
    this.store = new VersionedRoutingStore(initial, clientId);
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as VersionedRoutingSelection;
      this.store = new VersionedRoutingStore(parsed.selection, parsed.updatedByClientId, new Date(parsed.updatedAt));
      for (let revision = 0; revision < parsed.revision; revision++) {
        this.store.update(parsed.selection, revision, parsed.updatedByClientId, new Date(parsed.updatedAt));
      }
    }
  }

  get(): VersionedRoutingSelection {
    return this.store.get();
  }

  update(
    selection: EngineeringRoutingSelection,
    expectedRevision: number,
    updatedByClientId: string,
    now = new Date(),
  ): VersionedRoutingSelection {
    const updated = this.store.update(selection, expectedRevision, updatedByClientId, now);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
    return updated;
  }
}
