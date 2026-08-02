import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { InstalledExtension } from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import type { MarketplaceAsset, MarketplaceAssetVersionSummary } from '../src/index';
import { MarketplaceVersionTracker } from '../src/index';

const directories: string[] = [];
function temp(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-tracker-${name}-`));
  directories.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function installed(packageId: string, version: string): InstalledExtension {
  return {
    packageId,
    name: packageId,
    version,
    // LocalExtensionManager exposes `versions` and `currentVersion` on installed entries.
    versions: {
      [version]: {
        version,
        state: 'active',
        installedAt: '2026-07-01T00:00:00.000Z',
        sourcePath: `/tmp/${packageId}`,
        manifest: undefined as never,
      },
    },
    currentVersion: version,
    enabled: true,
  } as unknown as InstalledExtension;
}

function summary(version: string, vestara = '>=1.0.0'): MarketplaceAssetVersionSummary {
  return {
    version,
    isStable: !version.includes('-'),
    publishedAt: undefined,
    compatibility: { vestara },
    checksumVerified: true,
  };
}

function asset(packageName: string, versions: readonly string[]): MarketplaceAsset {
  const latest = versions.sort((a, b) => (a < b ? 1 : -1))[0];
  return {
    id: `acme/${packageName}`,
    slug: packageName,
    publisherId: 'acme',
    packageName,
    displayName: packageName,
    summary: packageName,
    type: 'plugin',
    tags: [],
    visibility: 'local',
    latestVersion: latest,
    versions: versions.map((v) => summary(v)),
    verification: { signed: false, signatureValidated: false, checksumVerified: true, runtimeVerified: false },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('MarketplaceVersionTracker', () => {
  it('tracks installed versions and persists them', () => {
    const storePath = path.join(temp('persist'), 'versions.json');
    const tracker = new MarketplaceVersionTracker({ storePath });
    tracker.trackInstalled([installed('toolbox', '1.0.0')]);
    expect(fs.existsSync(storePath)).toBe(true);

    const reloaded = new MarketplaceVersionTracker({ storePath });
    const snapshot = reloaded.snapshot(
      [installed('toolbox', '1.0.0')],
      new Map([['toolbox', asset('toolbox', ['1.0.0'])]]),
    );
    expect(snapshot.packages).toHaveLength(1);
    expect(snapshot.packages[0]?.installedVersion).toBe('1.0.0');
  });

  it('notifies once per available update and tracks the notified version', async () => {
    const storePath = path.join(temp('notify'), 'versions.json');
    const events: string[] = [];
    const tracker = new MarketplaceVersionTracker({
      storePath,
      eventSink: { publish: (event) => void events.push(event.type) },
    });
    const installedList = [installed('toolbox', '1.0.0')];
    const assets = new Map([['toolbox', asset('toolbox', ['1.0.0', '1.1.0'])]]);

    const first = await tracker.checkForUpdates(installedList, assets);
    expect(first).toHaveLength(1);
    expect(first[0]?.targetVersion).toBe('1.1.0');
    expect(events).toContain('marketplace.update.notification');

    const second = await tracker.checkForUpdates(installedList, assets);
    expect(second).toHaveLength(0);
    expect(events.filter((e) => e === 'marketplace.update.notification')).toHaveLength(1);
  });

  it('surfaces pending notifications in the snapshot and honors dismissal', async () => {
    const storePath = path.join(temp('dismiss'), 'versions.json');
    const tracker = new MarketplaceVersionTracker({ storePath });
    const installedList = [installed('toolbox', '1.0.0')];
    const assets = new Map([['toolbox', asset('toolbox', ['1.0.0', '1.2.0'])]]);

    const snapshot1 = tracker.snapshot(installedList, assets);
    expect(snapshot1.pendingNotifications).toHaveLength(1);

    tracker.dismiss('toolbox');
    const snapshot2 = tracker.snapshot(installedList, assets);
    expect(snapshot2.pendingNotifications).toHaveLength(0);
    expect(tracker.isDismissed('toolbox')).toBe(true);
  });

  it('recovers from a corrupt store', () => {
    const storePath = path.join(temp('corrupt'), 'versions.json');
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, '{not valid json');
    const tracker = new MarketplaceVersionTracker({ storePath });
    expect(tracker.snapshot([], new Map()).packages).toEqual([]);
  });
});
