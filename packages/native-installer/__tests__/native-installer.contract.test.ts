import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTerminalPhase, NativeInstallStore } from '../src/store';

describe('native installer store contract', () => {
  it('derives versioned package paths under the root', () => {
    const store = new NativeInstallStore({ root: '/opt/vestara' });
    expect(store.packageDir('pkg-a')).toBe(path.join('/opt/vestara', 'pkg-a'));
    expect(store.versionDir('pkg-a', '1.0.0')).toBe(path.join('/opt/vestara', 'pkg-a', 'versions', '1.0.0'));
  });

  it('classifies terminal install phases', () => {
    expect(isTerminalPhase('completed')).toBe(true);
    expect(isTerminalPhase('rolled-back')).toBe(true);
    expect(isTerminalPhase('failed')).toBe(true);
    expect(isTerminalPhase('installing')).toBe(false);
  });
});
