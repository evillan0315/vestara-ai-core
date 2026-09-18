/**
 * @vestara/ui: ActionIcon Contract Tests (UI-FOUNDATION-006)
 *
 * DOM-free: token/size maps and module-boundary assertions. Rendering
 * behavior is covered by workspace suites with an aligned React pair.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTION_ICON_SIZES, ACTION_ICON_TONES } from '../src/components/ActionIcon';

describe('ACTION_ICON_TONES', () => {
  it('covers default, muted, accent, and destructive with canonical tokens', () => {
    expect(Object.keys(ACTION_ICON_TONES).sort()).toEqual(['accent', 'default', 'destructive', 'muted']);
    expect(ACTION_ICON_TONES.destructive.text).toContain('var(--vestara-status-error)');
    expect(ACTION_ICON_TONES.accent.text).toContain('var(--vestara-accent)');
    expect(ACTION_ICON_TONES.muted.text).toContain('var(--vestara-text-muted)');
    expect(ACTION_ICON_TONES.default.text).toContain('var(--vestara-text-secondary)');
  });

  it('contains no raw palette values', () => {
    const serialized = JSON.stringify({ ...ACTION_ICON_TONES, ...ACTION_ICON_SIZES });
    expect(serialized).not.toMatch(/zinc-|amber-|red-|#[0-9a-fA-F]{3,6}/);
  });
});

describe('ACTION_ICON_SIZES', () => {
  it('preserves the audited square geometry', () => {
    expect(ACTION_ICON_SIZES).toEqual({ sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-11 w-11' });
  });
});

describe('ActionIcon module boundaries', () => {
  it('uses no MUI/Emotion, no raw palette, no domain imports', () => {
    const source = readFileSync(new URL('../src/components/ActionIcon.tsx', import.meta.url), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('*') && !trimmed.startsWith('/**') && !trimmed.startsWith('//');
      })
      .join('\n');
    const imports = code.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.join('\n')).not.toMatch(/@mui|emotion/);
    expect(code).not.toMatch(/zinc-|amber-|red-\[|#[0-9a-fA-F]{3,6}/);
    expect(code).not.toMatch(/style=\{\{/);
  });
});
