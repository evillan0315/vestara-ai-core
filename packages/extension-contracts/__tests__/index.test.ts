import { describe, expect, it } from 'vitest';
import { assertPackageManifest, type VestaraPackageManifest, validatePackageManifest } from '../src/index.js';

function manifest(): VestaraPackageManifest {
  return {
    schemaVersion: 1,
    id: 'vestara.mock-provider',
    name: 'Mock Provider',
    version: '1.0.0',
    description: 'Reference engineering provider',
    type: 'provider',
    publisher: { id: 'vestara', name: 'Vestara' },
    compatibility: { vestara: '>=1.0.0', node: '>=22' },
    entrypoints: { runtime: './runtime.js' },
    capabilities: ['engineering.implementation'],
    permissions: [{ capability: 'network.outbound', scope: 'provider-api', resources: ['localhost'] }],
    dependencies: [],
    contributions: { providers: [{ id: 'mock-provider' }] },
    isolation: 'in-process',
    integrity: { algorithm: 'sha256', digest: '0'.repeat(64) },
  };
}

describe('extension manifest contracts', () => {
  it('accepts a complete v1 package manifest', () => {
    expect(validatePackageManifest(manifest())).toMatchObject({ valid: true, errors: [] });
    expect(assertPackageManifest(manifest()).id).toBe('vestara.mock-provider');
  });

  it('rejects unsafe entrypoints, malformed versions, and invalid permissions', () => {
    const candidate = {
      ...manifest(),
      version: 'latest',
      entrypoints: { runtime: '../../outside.js' },
      permissions: [{ capability: 'filesystem.write', scope: 'planet' }],
    };
    const result = validatePackageManifest(candidate);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'version must be semver',
        'entrypoints.runtime must be a safe relative path',
        'permission requires a capability and valid scope',
      ]),
    );
  });

  it('rejects duplicate dependency identities', () => {
    const candidate = {
      ...manifest(),
      dependencies: [
        { packageId: 'vestara.base', version: '^1.0.0' },
        { packageId: 'vestara.base', version: '^1.1.0' },
      ],
    };
    expect(validatePackageManifest(candidate).errors).toContain('duplicate dependency: vestara.base');
  });
});
