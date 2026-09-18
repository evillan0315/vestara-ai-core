/**
 * @vestara/ui: PageHero Contract Tests (UI-FOUNDATION-002)
 *
 * DOM-free: pure defaults-merge, tone-token mapping, and module-boundary
 * assertions. Rendering is covered by the workspace migration suite
 * (apps/workspace/__tests__/page-hero-migration.test.tsx), which runs
 * with an aligned React pair.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeHeroDefaults, pageHeroStatusDotClass } from '../src/components/PageHero';

describe('mergeHeroDefaults', () => {
  it('merges registry defaults under explicit overrides', () => {
    expect(
      mergeHeroDefaults(
        { eyebrow: 'Workspace', title: 'Files', subtitle: 'static copy' },
        { subtitle: 'dynamic copy' },
      ),
    ).toEqual({ eyebrow: 'Workspace', title: 'Files', subtitle: 'dynamic copy' });
  });

  it('tolerates missing defaults and overrides', () => {
    expect(mergeHeroDefaults(undefined, { title: 'Bare' })).toEqual({ title: 'Bare' });
    expect(mergeHeroDefaults({ title: 'Base' }, undefined)).toEqual({ title: 'Base' });
  });
});

describe('pageHeroStatusDotClass', () => {
  it('maps every tone to canonical status tokens', () => {
    expect(pageHeroStatusDotClass('success')).toContain('var(--vestara-status-success)');
    expect(pageHeroStatusDotClass('warning')).toContain('var(--vestara-status-warning)');
    expect(pageHeroStatusDotClass('error')).toContain('var(--vestara-status-error)');
    expect(pageHeroStatusDotClass('info')).toContain('var(--vestara-status-info)');
  });

  it('defaults to success', () => {
    expect(pageHeroStatusDotClass()).toContain('var(--vestara-status-success)');
  });

  it('emits static literals (Tailwind-detectable, never interpolated)', () => {
    const source = readFileSync(new URL('../src/components/PageHero.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/bg-\[\$\{/);
  });
});

describe('PageHero module boundaries', () => {
  it('depends on no router, workspace code, or Activity Room contracts', () => {
    const source = readFileSync(new URL('../src/components/PageHero.tsx', import.meta.url), 'utf8');
    const code = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('*') && !trimmed.startsWith('/**') && !trimmed.startsWith('//');
      })
      .join('\n');
    const imports = code.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.join('\n')).not.toMatch(/react-router/);
    expect(imports.join('\n')).not.toMatch(/@vestara\/(workspace|activity-room)/);
    expect(code).not.toMatch(/mpg-/);
    expect(code).not.toMatch(/style=\{\{/);
  });
});
