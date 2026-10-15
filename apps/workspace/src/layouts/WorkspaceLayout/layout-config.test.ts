/**
 * layout-config focused suite: defaults, migration, clamping, import, paths.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT_CONFIG,
  migrateLayoutConfig,
  parseLayoutConfigJson,
  withLayoutPath,
} from './layout-config.js';

describe('DEFAULT_LAYOUT_CONFIG', () => {
  it('is internally valid through migration', () => {
    expect(migrateLayoutConfig(DEFAULT_LAYOUT_CONFIG)).toEqual(DEFAULT_LAYOUT_CONFIG);
  });
});

describe('migrateLayoutConfig', () => {
  it('returns defaults for non-objects', () => {
    for (const input of [null, undefined, 42, 'layout', []]) {
      expect(migrateLayoutConfig(input)).toEqual(DEFAULT_LAYOUT_CONFIG);
    }
  });

  it('fills missing keys and drops unknown keys', () => {
    const migrated = migrateLayoutConfig({ navigation: { style: 'rail' }, extra: true });
    expect(migrated.navigation.style).toBe('rail');
    expect(migrated.navigation.position).toBe(DEFAULT_LAYOUT_CONFIG.navigation.position);
    expect(migrated).not.toHaveProperty('extra');
  });

  it('falls back per-field on invalid enums', () => {
    const migrated = migrateLayoutConfig({
      navigation: { style: 'floating', position: 'up' },
      density: 'huge',
      panels: { centerPanel: { tabStyle: 'tabs' } },
    });
    expect(migrated.navigation.style).toBe(DEFAULT_LAYOUT_CONFIG.navigation.style);
    expect(migrated.navigation.position).toBe(DEFAULT_LAYOUT_CONFIG.navigation.position);
    expect(migrated.density).toBe(DEFAULT_LAYOUT_CONFIG.density);
    expect(migrated.panels.centerPanel.tabStyle).toBe(DEFAULT_LAYOUT_CONFIG.panels.centerPanel.tabStyle);
  });

  it('clamps panel widths into range', () => {
    const migrated = migrateLayoutConfig({
      panels: { leftPanel: { width: 9000 }, rightPanel: { width: -5 } },
    });
    expect(migrated.panels.leftPanel.width).toBe(400);
    expect(migrated.panels.rightPanel.width).toBe(240);
  });

  it('rejects invalid tab names', () => {
    const migrated = migrateLayoutConfig({
      panels: { leftPanel: { defaultTab: 'nope' }, rightPanel: { defaultTab: 'nope' } },
    });
    expect(migrated.panels.leftPanel.defaultTab).toBe('files');
    expect(migrated.panels.rightPanel.defaultTab).toBe('inspector');
  });
});

describe('parseLayoutConfigJson', () => {
  it('round-trips valid JSON', () => {
    const raw = JSON.stringify({ ...DEFAULT_LAYOUT_CONFIG, density: 'compact' });
    const result = parseLayoutConfigJson(raw);
    expect(result.ok).toBe(true);
    expect(result.config?.density).toBe('compact');
  });

  it('reports invalid JSON and empty input', () => {
    expect(parseLayoutConfigJson('').ok).toBe(false);
    const broken = parseLayoutConfigJson('{oops');
    expect(broken.ok).toBe(false);
    expect(broken.error).toMatch(/Invalid JSON/);
  });
});

describe('withLayoutPath', () => {
  it('updates immutably with validation', () => {
    const next = withLayoutPath(DEFAULT_LAYOUT_CONFIG, 'panels.leftPanel.width', 350);
    expect(next.panels.leftPanel.width).toBe(350);
    expect(DEFAULT_LAYOUT_CONFIG.panels.leftPanel.width).toBe(280);
  });

  it('clamps out-of-range writes', () => {
    expect(withLayoutPath(DEFAULT_LAYOUT_CONFIG, 'panels.rightPanel.width', 9999).panels.rightPanel.width).toBe(
      420,
    );
  });

  it('ignores invalid enum writes', () => {
    expect(withLayoutPath(DEFAULT_LAYOUT_CONFIG, 'density', 'mega').density).toBe(
      DEFAULT_LAYOUT_CONFIG.density,
    );
  });
});
