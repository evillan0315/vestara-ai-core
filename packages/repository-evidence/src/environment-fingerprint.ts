/**
 * Environment fingerprinting — stable identity for the environment a run was
 * executed in. Two runs with different environments are not directly
 * comparable on dimensions that depend on the environment.
 */

import { createHash } from 'node:crypto';
import type { EnvironmentFingerprint } from './repository-evidence';

export function environmentFingerprint(
  input: Omit<EnvironmentFingerprint, 'dependencyLockHash'> & { dependencyLockHash: string },
): EnvironmentFingerprint {
  return { ...input };
}

export function lockfileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function environmentChanged(baseline: EnvironmentFingerprint, current: EnvironmentFingerprint): string[] {
  const dimensions: string[] = [];
  for (const key of [
    'nodeVersion',
    'platform',
    'architecture',
    'packageManagerVersion',
    'dependencyLockHash',
  ] as const) {
    if (baseline[key] !== current[key]) dimensions.push(key);
  }
  return dimensions;
}
