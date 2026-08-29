import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';

export type SignatureAlgorithm = 'ed25519';

export interface SignatureVerificationResult {
  readonly valid: boolean;
  readonly algorithm: SignatureAlgorithm;
  readonly reason?: string;
}

export interface PublisherKeyPair {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

const ALGORITHM: SignatureAlgorithm = 'ed25519';

/**
 * Signing payload: the content digest plus manifest identity. We sign the
 * digest (not the whole manifest) so the signature remains valid across
 * serialization whitespace differences while still binding to a specific
 * package/version.
 */
export function signaturePayload(manifest: VestaraPackageManifest): string {
  return `${manifest.id}@${manifest.version}\n${manifest.integrity.digest}`;
}

/** Generate an Ed25519 key pair for a publisher (PEM encoded). */
export function generatePublisherKeys(): PublisherKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Sign the manifest digest, returning a base64 signature string. */
export function signManifest(manifest: VestaraPackageManifest, privateKeyPem: string): string {
  const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem' });
  const signature = sign(null, Buffer.from(signaturePayload(manifest), 'utf8'), privateKey);
  return signature.toString('base64');
}

/**
 * Verify a manifest's signature against a publisher public key. Returns
 * `valid: false` with a reason when the signature is absent, malformed, or
 * does not verify.
 */
export function verifyManifest(manifest: VestaraPackageManifest, publicKeyPem: string): SignatureVerificationResult {
  if (!manifest.integrity.signature) {
    return { valid: false, algorithm: ALGORITHM, reason: 'package has no signature' };
  }
  try {
    const publicKey = createPublicKey({ key: publicKeyPem, format: 'pem' });
    const verified = verify(
      null,
      Buffer.from(signaturePayload(manifest), 'utf8'),
      publicKey,
      Buffer.from(manifest.integrity.signature, 'base64'),
    );
    return {
      valid: verified,
      algorithm: ALGORITHM,
      ...(verified ? {} : { reason: 'signature does not match the package digest' }),
    };
  } catch (error) {
    return {
      valid: false,
      algorithm: ALGORITHM,
      reason: error instanceof Error ? error.message : 'signature verification failed',
    };
  }
}
