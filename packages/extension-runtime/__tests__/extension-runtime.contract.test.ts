import { describe, expect, it } from 'vitest';
import { satisfies, VESTARA_PACKAGE_MANIFEST } from '../src/index';

describe('extension version range contract', () => {
  it('evaluates caret, wildcard, comparison, and exact ranges', () => {
    expect(VESTARA_PACKAGE_MANIFEST).toBe('vestara-package.json');
    expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfies('1.9.9', '*')).toBe(true);
    expect(satisfies('1.2.3', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
  });
});
