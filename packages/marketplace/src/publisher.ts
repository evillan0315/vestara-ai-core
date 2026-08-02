import { createPublicKey } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { digestPackageDirectory, readManifest, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import { errorMessage, MarketplaceError } from './errors';
import type { MarketplaceEventSink } from './registry';
import { generatePublisherKeys, signManifest, verifyManifest } from './signature';

export interface PublishSource {
  /** Absolute path to the package directory (contains `vestara-package.json`). */
  readonly packagePath: string;
}

export interface PublishSigning {
  /** PEM-encoded private key. Absent → the package is published unsigned. */
  readonly privateKeyPem?: string;
}

export interface PublishOptions {
  readonly source: PublishSource;
  readonly signing?: PublishSigning;
  readonly eventSink?: MarketplaceEventSink;
}

export interface PublishResult {
  readonly packageName: string;
  readonly publisherId: string;
  readonly version: string;
  readonly packagePath: string;
  readonly digest: string;
  readonly signed: boolean;
  readonly signatureValid: boolean;
  readonly publishedAt: string;
}

export interface GenerateKeysResult {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

/**
 * Validates a package directory, recomputes its content digest, signs the
 * digest with the publisher's Ed25519 key (when provided), and rewrites the
 * package manifest so it becomes a publishable artifact. The digest excludes
 * the manifest itself, so signing the manifest in place does not invalidate it.
 */
export class MarketplacePublisher {
  publish(options: PublishOptions): PublishResult {
    const packagePath = path.resolve(options.source.packagePath);
    let manifest: VestaraPackageManifest;
    try {
      manifest = readManifest(packagePath);
    } catch (error) {
      throw new MarketplaceError(
        'marketplace.invalid-package',
        `Cannot publish ${packagePath}: ${errorMessage(error)}`,
        { packagePath },
      );
    }

    const digest = digestPackageDirectory(packagePath);
    const signed = Boolean(options.signing?.privateKeyPem);
    const integrity = { algorithm: 'sha256' as const, digest };
    const manifestWithDigest: VestaraPackageManifest = {
      ...manifest,
      integrity: signed
        ? { ...integrity, signature: signManifest({ ...manifest, integrity }, options.signing!.privateKeyPem!) }
        : integrity,
    };

    const signatureValid = signed
      ? verifyManifest(manifestWithDigest, publicKeyOf(options.signing!.privateKeyPem!)).valid
      : false;
    if (signed && !signatureValid) {
      throw new MarketplaceError(
        'marketplace.invalid-package',
        `Signature failed self-verification for ${manifest.id}@${manifest.version}`,
        { packagePath },
      );
    }

    fs.writeFileSync(
      path.join(packagePath, VESTARA_PACKAGE_MANIFEST),
      `${JSON.stringify(manifestWithDigest, null, 2)}\n`,
    );

    const result: PublishResult = {
      packageName: manifestWithDigest.id,
      publisherId: manifestWithDigest.publisher.id,
      version: manifestWithDigest.version,
      packagePath,
      digest,
      signed,
      signatureValid,
      publishedAt: new Date().toISOString(),
    };
    void this.emit(options.eventSink, 'marketplace.package.published', {
      packageName: result.packageName,
      version: result.version,
      publisherId: result.publisherId,
      signed: result.signed,
    });
    return result;
  }

  generateKeys(): GenerateKeysResult {
    return generatePublisherKeys();
  }

  private async emit(
    sink: MarketplaceEventSink | undefined,
    type: `marketplace.${string}`,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await sink?.publish({
      type,
      timestamp: new Date().toISOString(),
      correlationId: identifier('publish'),
      metadata,
    });
  }
}

function publicKeyOf(privateKeyPem: string): string {
  return createPublicKey({ key: privateKeyPem, format: 'pem' }).export({ type: 'spki', format: 'pem' }).toString();
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
