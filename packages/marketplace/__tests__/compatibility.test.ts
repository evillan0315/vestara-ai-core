import { afterAll, describe, expect, it } from 'vitest';
import {
  checkCompatibility,
  compatibilityLabel,
  compatibilityStatusOf,
  isCompatible,
  platformToOperatingSystem,
} from '../src/index.js';
import { cleanup } from './helpers.js';

afterAll(cleanup);

const context = {
  vestaraVersion: '1.0.0',
  nodeVersion: '22.11.0',
  operatingSystem: 'linux',
  architecture: 'x64',
};

describe('compatibility', () => {
  it('reports compatible when nothing constrains the runtime', () => {
    expect(checkCompatibility({ vestara: '>=1.0.0' }, context)).toBe('compatible');
    expect(checkCompatibility(undefined, context)).toBe('compatible');
  });

  it('rejects incompatible Vestara versions before other checks', () => {
    expect(checkCompatibility({ vestara: '>=9.0.0' }, context)).toBe('incompatible-vestara');
  });

  it('rejects incompatible Node, OS, and architecture independently', () => {
    expect(checkCompatibility({ vestara: '>=1.0.0', node: '>=24.0.0' }, context)).toBe('incompatible-node');
    expect(checkCompatibility({ vestara: '>=1.0.0', operatingSystems: ['macos'] }, context)).toBe(
      'incompatible-operating-system',
    );
    expect(checkCompatibility({ vestara: '>=1.0.0', architectures: ['arm64'] }, context)).toBe(
      'incompatible-architecture',
    );
  });

  it('normalizes darwin to macos like extension-runtime', () => {
    expect(platformToOperatingSystem('darwin')).toBe('macos');
    expect(platformToOperatingSystem('linux')).toBe('linux');
  });

  it('checks manifests through compatibilityStatusOf and labels failures', () => {
    const status = compatibilityStatusOf({ compatibility: { vestara: '>=9.0.0' } }, context);
    expect(status).toBe('incompatible-vestara');
    expect(isCompatible({ vestara: '>=1.0.0' }, context)).toBe(true);
    expect(compatibilityLabel('incompatible-vestara')).toContain('Vestara');
    expect(compatibilityLabel('compatible')).toBe('compatible');
  });
});
