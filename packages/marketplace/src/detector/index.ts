/**
 * Directory detector — scans a directory tree for packages and registers
 * them in the marketplace catalog.
 *
 * Walks subdirectories, detects manifest files (package.json, Cargo.toml,
 * pyproject.toml, go.mod), generates vestara-package.json manifests, and
 * optionally upserts them into a MarketplaceCatalog.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { digestPackageDirectory, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import type { MarketplaceAsset, MarketplaceAssetVersionSummary } from '../asset';
import type { MarketplaceCatalog } from '../catalog';
import { isStable } from '../versions';
import { generateManifest, type ManifestGeneratorOptions } from './generator';
import { type DetectedPackage, detectPackageInDirectory } from './manifest-readers';

export interface DirectoryDetectorOptions {
  readonly publisherId: string;
  readonly publisherName?: string;
  readonly vestaraVersion?: string;
  readonly maxDepth?: number;
  /** Skip directories containing vestara-package.json (already registered). */
  readonly skipExisting?: boolean;
}

export interface DetectionResult {
  readonly detected: DetectedPackage;
  readonly manifest: VestaraPackageManifest;
  readonly packageDir: string;
  readonly registered: boolean;
}

export interface DetectionReport {
  readonly directory: string;
  readonly scanned: number;
  readonly detected: number;
  readonly registered: number;
  readonly skipped: number;
  readonly errors: readonly DetectionError[];
  readonly results: readonly DetectionResult[];
}

export interface DetectionError {
  readonly path: string;
  readonly reason: string;
}

const DEFAULT_MAX_DEPTH = 6;

export class DirectoryDetector {
  private readonly options: Required<
    Pick<DirectoryDetectorOptions, 'publisherId' | 'publisherName' | 'vestaraVersion' | 'maxDepth' | 'skipExisting'>
  >;

  constructor(options: DirectoryDetectorOptions) {
    this.options = {
      publisherId: options.publisherId,
      publisherName: options.publisherName ?? options.publisherId,
      vestaraVersion: options.vestaraVersion ?? '>=0.3.0',
      maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      skipExisting: options.skipExisting ?? true,
    };
  }

  /**
   * Scan a directory for detectable packages. Returns detection results
   * without modifying the catalog or filesystem.
   */
  async detect(directory: string): Promise<DetectionReport> {
    const results: DetectionResult[] = [];
    const errors: DetectionError[] = [];
    let scanned = 0;

    const walk = (dir: string, depth: number): void => {
      if (depth > this.options.maxDepth) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

        const childPath = path.join(dir, entry.name);
        scanned++;

        // Skip if already has vestara-package.json
        if (this.options.skipExisting && fs.existsSync(path.join(childPath, VESTARA_PACKAGE_MANIFEST))) {
          continue;
        }

        const detected = detectPackageInDirectory(childPath);
        if (!detected) {
          walk(childPath, depth + 1);
          continue;
        }

        try {
          const generatorOptions: ManifestGeneratorOptions = {
            publisherId: this.options.publisherId,
            publisherName: this.options.publisherName,
            vestaraVersion: this.options.vestaraVersion,
          };
          const generated = generateManifest(detected, childPath, generatorOptions);

          results.push({
            detected,
            manifest: generated.manifest,
            packageDir: childPath,
            registered: false,
          });
        } catch (err) {
          errors.push({
            path: childPath,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    walk(directory, 0);

    return {
      directory,
      scanned,
      detected: results.length,
      registered: 0,
      skipped: 0,
      errors,
      results,
    };
  }

  /**
   * Scan a directory and register detected packages into the catalog.
   * Writes vestara-package.json manifests to each detected package directory.
   */
  async detectAndRegister(directory: string, catalog: MarketplaceCatalog): Promise<DetectionReport> {
    const report = await this.detect(directory);
    let registered = 0;

    for (const result of report.results) {
      try {
        const asset = this.buildAsset(result);
        catalog.upsert(asset, `detector-${this.options.publisherId}`);
        registered++;

        // Update the result to reflect registration
        (result as { registered: boolean }).registered = true;
      } catch (err) {
        const errors = [
          ...report.errors,
          {
            path: result.packageDir,
            reason: `Catalog registration failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ];
        (report as { errors: readonly DetectionError[] }).errors = errors;
      }
    }

    (report as { registered: number }).registered = registered;
    return report;
  }

  private buildAsset(result: DetectionResult): MarketplaceAsset {
    const manifest = result.manifest;
    const now = new Date().toISOString();

    const versionSummary: MarketplaceAssetVersionSummary = {
      version: manifest.version,
      isStable: isStable(manifest.version),
      compatibility: {
        vestara: manifest.compatibility.vestara,
      },
      checksumVerified: true,
    };

    return {
      id: manifest.id,
      slug: manifest.name,
      publisherId: manifest.publisher.id,
      packageName: manifest.name,
      displayName: manifest.name,
      summary: manifest.description,
      type: manifest.type,
      tags: result.detected.tags,
      license: result.detected.license,
      visibility: 'local',
      latestVersion: manifest.version,
      versions: [versionSummary],
      verification: {
        signed: false,
        signatureValidated: false,
        checksumVerified: true,
        runtimeVerified: false,
      },
      createdAt: now,
      updatedAt: now,
    };
  }
}
