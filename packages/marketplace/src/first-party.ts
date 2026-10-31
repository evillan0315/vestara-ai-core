/**
 * First-party scanners — dependency-free builders projecting the repo's own
 * UI-component catalogs, template directories, and app manifests into
 * `MarketplaceAsset` records.
 *
 * Dependency-free by design: inputs are structural shapes, so callers pass
 * `UI_COMPONENT_CATALOG` entries, template dir metadata, or app manifest
 * fields without this package importing `@vestara/ui-components`,
 * `@vestara/marketplace-ui`, or `apps/*` (monorepo boundary guard).
 *
 * Tag contract (registration convention):
 * - `ui-component` assets carry `['ui', 'components', <group>, <entry-id>]`
 *   so the Discover `ui-components` filter matches them by type AND legacy
 *   tag-only clients still match them by tags.
 * - `template` assets carry `['template', ...input.tags]`.
 * - `app` assets carry `['app', ...input.tags]`.
 */

import type { MarketplaceAsset, MarketplaceAssetVersionSummary } from './asset';
import { isStable } from './versions';

/** Registration tag convention for first-party assets. */
export const FIRST_PARTY_TAGS = {
  uiComponent: ['ui', 'components', 'primitives', 'design-system'] as const,
  template: ['template'] as const,
  app: ['app'] as const,
} as const;

/** Structural subset of a `UiComponentEntry` (no import of `@vestara/ui-components`). */
export interface FirstPartyComponentEntry {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly description: string;
}

export interface FirstPartyCatalogOptions {
  readonly publisherId?: string;
  readonly version?: string;
  readonly vestaraVersion?: string;
}

export interface FirstPartyTemplateInput {
  readonly packageName: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly version?: string;
  readonly publisherId?: string;
  readonly tags?: readonly string[];
}

export interface FirstPartyAppInput {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly publisherId?: string;
  readonly tags?: readonly string[];
}

const DEFAULT_PUBLISHER = 'vestara';
const DEFAULT_VERSION = '0.1.0';

function versionSummary(version: string, vestaraVersion: string): MarketplaceAssetVersionSummary {
  return {
    version,
    isStable: isStable(version),
    compatibility: { vestara: vestaraVersion },
    checksumVerified: true,
  };
}

function timestamps(): { createdAt: string; updatedAt: string } {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now };
}

/**
 * Project every entry of a UI-component catalog (e.g. `UI_COMPONENT_CATALOG`)
 * into an individually discoverable `ui-component` asset. Package names are
 * `ui-components-<entry-id>` (lowercased) — deterministic, slash-free so the
 * `publisher/name` catalog key stays unambiguous.
 */
export function uiComponentCatalogToAssets(
  entries: readonly FirstPartyComponentEntry[],
  options: FirstPartyCatalogOptions = {},
): MarketplaceAsset[] {
  const publisherId = options.publisherId ?? DEFAULT_PUBLISHER;
  const version = options.version ?? DEFAULT_VERSION;
  const vestaraVersion = options.vestaraVersion ?? '>=0.3.0';
  const summary = versionSummary(version, vestaraVersion);
  return entries.map((entry) => {
    const packageName = `ui-components-${entry.id.toLowerCase()}`;
    return {
      id: `${publisherId}/${packageName}`,
      slug: packageName,
      publisherId,
      packageName,
      displayName: entry.name,
      summary: entry.description,
      description: entry.description,
      type: 'ui-component',
      tags: [...FIRST_PARTY_TAGS.uiComponent, entry.group.toLowerCase(), entry.id.toLowerCase()],
      visibility: 'local',
      latestVersion: version,
      versions: [summary],
      verification: {
        signed: false,
        signatureValidated: false,
        checksumVerified: true,
        runtimeVerified: false,
      },
      ...timestamps(),
    } satisfies MarketplaceAsset;
  });
}

/** Project a template directory into a `template` asset. */
export function templateDirToAsset(input: FirstPartyTemplateInput): MarketplaceAsset {
  const publisherId = input.publisherId ?? DEFAULT_PUBLISHER;
  const version = input.version ?? DEFAULT_VERSION;
  const displayName = input.displayName ?? input.packageName;
  const summary = input.description ?? `${input.packageName} — workspace template`;
  return {
    id: `${publisherId}/${input.packageName}`,
    slug: input.packageName,
    publisherId,
    packageName: input.packageName,
    displayName,
    summary,
    description: input.description,
    type: 'template',
    tags: [...FIRST_PARTY_TAGS.template, ...(input.tags ?? [])],
    visibility: 'local',
    latestVersion: version,
    versions: [versionSummary(version, '*')],
    verification: {
      signed: false,
      signatureValidated: false,
      checksumVerified: true,
      runtimeVerified: false,
    },
    ...timestamps(),
  } satisfies MarketplaceAsset;
}

/** Project an app manifest (e.g. `apps/*` `package.json` fields) into an `app` asset. */
export function appManifestToAsset(input: FirstPartyAppInput): MarketplaceAsset {
  const publisherId = input.publisherId ?? DEFAULT_PUBLISHER;
  const version = input.version ?? DEFAULT_VERSION;
  const summary = input.description ?? `${input.name} — workspace app`;
  return {
    id: `${publisherId}/${input.name}`,
    slug: input.name,
    publisherId,
    packageName: input.name,
    displayName: input.name,
    summary,
    description: input.description,
    type: 'app',
    tags: [...FIRST_PARTY_TAGS.app, ...(input.tags ?? [])],
    visibility: 'local',
    latestVersion: version,
    versions: [versionSummary(version, '*')],
    verification: {
      signed: false,
      signatureValidated: false,
      checksumVerified: true,
      runtimeVerified: false,
    },
    ...timestamps(),
  } satisfies MarketplaceAsset;
}
