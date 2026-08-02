import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstalledExtension } from '@vestara/extension-runtime';
import type { MarketplaceAsset } from './asset';
import type { RuntimeCompatibilityContext } from './compatibility';
import { errorMessage } from './errors';
import type { MarketplaceEventSink } from './registry';
import { detectUpdates, type MarketplaceUpdateCandidate } from './updates';

export interface TrackedVersionEntry {
  readonly packageName: string;
  readonly installedVersion: string;
  readonly lastNotifiedVersion?: string;
  readonly notifiedAt?: string;
  readonly dismissed?: boolean;
}

export interface VersionTrackerSnapshot {
  readonly generatedAt: string;
  readonly packages: readonly TrackedVersionEntry[];
  readonly updates: readonly MarketplaceUpdateCandidate[];
  readonly pendingNotifications: readonly MarketplaceUpdateCandidate[];
}

export interface VersionTrackerOptions {
  /** Absolute path to the tracking store file (JSON). Created on first write. */
  readonly storePath: string;
  readonly eventSink?: MarketplaceEventSink;
}

interface PersistedState {
  readonly entries: Record<string, TrackedVersionEntry>;
}

/**
 * Persisted installed-version tracking. Records the installed version of each
 * package, computes available updates against the catalog, and surfaces only
 * *new* (not-yet-notified, not-dismissed) updates as notifications. This is
 * the durable companion to `MarketplaceService.listUpdates()` which computes
 * updates on the fly.
 */
export class MarketplaceVersionTracker {
  private readonly storePath: string;
  private readonly eventSink?: MarketplaceEventSink;
  private readonly entries: Map<string, TrackedVersionEntry> = new Map();

  constructor(options: VersionTrackerOptions) {
    this.storePath = path.resolve(options.storePath);
    this.eventSink = options.eventSink;
    this.load();
  }

  trackInstalled(installed: readonly InstalledExtension[]): void {
    for (const entry of installed) {
      const previous = this.entries.get(entry.packageId);
      this.entries.set(entry.packageId, {
        packageName: entry.packageId,
        installedVersion: entry.currentVersion,
        lastNotifiedVersion: previous?.lastNotifiedVersion,
        notifiedAt: previous?.notifiedAt,
        dismissed: previous?.dismissed ?? false,
      });
    }
    this.save();
  }

  /**
   * Detect updates and emit a notification event for each update not yet
   * notified and not dismissed. Marks them as notified so each update
   * notifies once.
   */
  async checkForUpdates(
    installed: readonly InstalledExtension[],
    assets: ReadonlyMap<string, MarketplaceAsset>,
    context?: RuntimeCompatibilityContext,
  ): Promise<MarketplaceUpdateCandidate[]> {
    this.trackInstalled(installed);
    const updates = detectUpdates(installed, assets, context);
    const pending: MarketplaceUpdateCandidate[] = [];
    for (const update of updates) {
      const tracked = this.entries.get(update.packageName);
      const alreadyNotified = tracked?.lastNotifiedVersion === update.targetVersion;
      const dismissed = tracked?.dismissed === true;
      if (!alreadyNotified && !dismissed) {
        pending.push(update);
        this.entries.set(update.packageName, {
          ...(tracked ?? { packageName: update.packageName, installedVersion: update.installedVersion }),
          lastNotifiedVersion: update.targetVersion,
          notifiedAt: new Date().toISOString(),
          dismissed: false,
        });
        await this.emit('marketplace.update.notification', {
          packageName: update.packageName,
          fromVersion: update.installedVersion,
          toVersion: update.targetVersion,
          updateType: update.updateType,
        });
      }
    }
    this.save();
    return pending;
  }

  dismiss(packageName: string): void {
    const entry = this.entries.get(packageName);
    if (!entry) return;
    this.entries.set(packageName, { ...entry, dismissed: true });
    this.save();
  }

  isDismissed(packageName: string): boolean {
    return this.entries.get(packageName)?.dismissed === true;
  }

  snapshot(
    installed: readonly InstalledExtension[],
    assets: ReadonlyMap<string, MarketplaceAsset>,
    context?: RuntimeCompatibilityContext,
  ): VersionTrackerSnapshot {
    this.trackInstalled(installed);
    const updates = detectUpdates(installed, assets, context);
    const pending = updates.filter(
      (update) =>
        !this.isDismissed(update.packageName) &&
        this.entries.get(update.packageName)?.lastNotifiedVersion !== update.targetVersion,
    );
    return {
      generatedAt: new Date().toISOString(),
      packages: Array.from(this.entries.values()).map((entry) => ({ ...entry })),
      updates,
      pendingNotifications: pending,
    };
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf8')) as PersistedState;
      for (const [name, entry] of Object.entries(parsed.entries ?? {})) this.entries.set(name, entry);
    } catch (error) {
      // A corrupt store should not crash the tracker; it resets in-memory state.
      this.entries.clear();
      void this.eventSink?.publish({
        type: 'marketplace.version-tracker.corrupt',
        timestamp: new Date().toISOString(),
        correlationId: identifier('tracker'),
        metadata: { reason: errorMessage(error) },
      });
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    const state: PersistedState = {
      entries: Object.fromEntries(this.entries),
    };
    fs.writeFileSync(this.storePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  private async emit(type: `marketplace.${string}`, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    await this.eventSink?.publish({
      type,
      timestamp: new Date().toISOString(),
      correlationId: identifier('tracker'),
      metadata,
    });
  }
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
