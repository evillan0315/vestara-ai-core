/**
 * @vestara/marketplace-ui — UI Components category contracts.
 *
 * Proves the cross-type UI Components taxonomy: canonical type
 * normalization, a tag-discriminated category filter, and the shared UI /
 * tokens / primitives fixtures all matching that category.
 */

import { describe, expect, it } from 'vitest';
import {
  assetMatchesCategory,
  DISCOVER_CATEGORY_FILTERS,
  normalizePackageType,
  UI_COMPONENT_FIXTURES,
} from '../src/index';

describe('normalizePackageType', () => {
  it('maps legacy UI aliases onto the canonical ui-component type', () => {
    expect(normalizePackageType('ui')).toBe('ui-component');
    expect(normalizePackageType('component')).toBe('ui-component');
    expect(normalizePackageType('components')).toBe('ui-component');
    expect(normalizePackageType('tool')).toBe('plugin');
    expect(normalizePackageType('system')).toBe('standards-pack');
  });

  it('passes the canonical template/app/ui-component types through', () => {
    expect(normalizePackageType('template')).toBe('template');
    expect(normalizePackageType('app')).toBe('app');
    expect(normalizePackageType('ui-component')).toBe('ui-component');
  });
});

describe('UI Components category filter', () => {
  it('matches the canonical ui-component type with legacy tag fallback', () => {
    const filter = DISCOVER_CATEGORY_FILTERS.find((f) => f.id === 'ui-components');
    expect(filter).toBeDefined();
    expect(filter?.label).toBe('UI Components');
    expect(filter?.match).toContain('ui-component');
    expect(filter?.tags).toContain('ui');
    expect(filter?.tags).toContain('design-system');
  });

  it('declares template and app category filters', () => {
    const template = DISCOVER_CATEGORY_FILTERS.find((f) => f.id === 'template');
    const app = DISCOVER_CATEGORY_FILTERS.find((f) => f.id === 'app');
    expect(template?.match).toEqual(['template']);
    expect(app?.match).toEqual(['app']);
  });

  it('matches canonical ui-component/template/app assets by type', () => {
    expect(assetMatchesCategory({ type: 'ui-component', tags: [] }, 'ui-components')).toBe(true);
    expect(assetMatchesCategory({ type: 'template', tags: [] }, 'template')).toBe(true);
    expect(assetMatchesCategory({ type: 'app', tags: [] }, 'app')).toBe(true);
  });

  it('matches every shared UI / tokens / primitives fixture', () => {
    for (const fixture of UI_COMPONENT_FIXTURES) {
      expect(assetMatchesCategory(fixture.asset, 'ui-components')).toBe(true);
    }
  });

  it('does not match unrelated assets', () => {
    expect(assetMatchesCategory({ type: 'provider', tags: ['DevOps', 'Docker'] }, 'ui-components')).toBe(false);
    expect(assetMatchesCategory({ type: 'module', tags: ['Testing'] }, 'ui-components')).toBe(false);
  });

  it('matches tags case-insensitively', () => {
    expect(assetMatchesCategory({ type: 'module', tags: ['UI'] }, 'ui-components')).toBe(true);
    expect(assetMatchesCategory({ type: 'module', tags: ['Primitives'] }, 'ui-components')).toBe(true);
  });

  it('"all" matches any asset', () => {
    expect(assetMatchesCategory({ type: 'provider', tags: [] }, 'all')).toBe(true);
  });
});
