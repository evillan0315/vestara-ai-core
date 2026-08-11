/**
 * Maps detected package metadata to VestaraPackageType.
 *
 * Uses signals from the manifest (name patterns, fields, ecosystem)
 * to classify a detected package into the appropriate marketplace type.
 */

import type { VestaraPackageType } from '@vestara/extension-contracts';
import type { DetectedPackage } from './manifest-readers';

export function mapPackageType(detected: DetectedPackage): VestaraPackageType {
  const name = detected.name.toLowerCase();
  const tags = detected.tags.map((t) => t.toLowerCase());
  const raw = detected.rawManifest;

  // Explicit type in manifest (e.g., package.json "vestara" field)
  const explicitType = extractExplicitType(raw);
  if (explicitType) return explicitType;

  // Name-based heuristics
  if (name.includes('theme') || name.includes('skin') || name.includes('color')) return 'theme';
  if (name.includes('agent') && (name.includes('pack') || name.includes('bundle'))) return 'agent-pack';
  if (name.includes('integration') || name.includes('connector') || name.includes('bridge')) return 'integration';
  if (name.includes('verify') || name.includes('validation') || name.includes('lint') || name.includes('check'))
    return 'verification-pack';
  if (name.includes('standard') || name.includes('rule') || name.includes('convention')) return 'standards-pack';
  if (name.includes('provider') || name.includes('backend') || name.includes('driver')) return 'provider';
  if (name.includes('tui') || name.includes('terminal') || name.includes('console-ui')) return 'tui';

  // Field-based heuristics (Node.js)
  if (typeof raw === 'object' && raw !== null) {
    const pkg = raw as Record<string, unknown>;
    if (typeof pkg.bin === 'string' || (typeof pkg.bin === 'object' && pkg.bin !== null)) {
      return 'plugin';
    }
    if (typeof pkg.scripts === 'object' && pkg.scripts !== null) {
      const scripts = pkg.scripts as Record<string, unknown>;
      if (typeof scripts.start === 'string' || typeof scripts.dev === 'string') {
        // Has start/dev scripts — likely an app/service, treat as module
        return 'module';
      }
    }
  }

  // Ecosystem-based defaults
  if (tags.includes('rust')) return 'module';
  if (tags.includes('python')) return 'module';
  if (tags.includes('go')) return 'module';

  return 'module';
}

function extractExplicitType(raw: Record<string, unknown>): VestaraPackageType | null {
  // Check for a "vestara" field in package.json
  const vestara = raw.vestara;
  if (typeof vestara === 'object' && vestara !== null && 'type' in vestara) {
    const t = (vestara as Record<string, unknown>).type;
    if (typeof t === 'string' && isValidVestaraType(t)) {
      return t;
    }
  }
  return null;
}

const VALID_TYPES: readonly string[] = [
  'provider',
  'module',
  'plugin',
  'agent-pack',
  'integration',
  'theme',
  'verification-pack',
  'standards-pack',
  'tui',
];

function isValidVestaraType(value: string): value is VestaraPackageType {
  return VALID_TYPES.includes(value);
}
