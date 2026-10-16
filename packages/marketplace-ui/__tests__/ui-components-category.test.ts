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
  it('maps legacy UI aliases onto canonical types', () => {
    expect(normalizePackageType('ui')).toBe('theme');
    expect(normalizePackageType('component')).toBe('theme');
    expect(normalizePackageType('template')).toBe('theme');
    expect(normalizePackageType('tool')).toBe('plugin');
    expect(normalizePackageType('system')).toBe('standards-pack');
  });
});

describe('UI Components category filter', () => {
  it('is declared with tag discriminators', () => {
    const filter = DISCOVER_CATEGORY_FILTERS.find((f) => f.id === 'ui-components');
    expect(filter).toBeDefined();
    expect(filter?.label).toBe('UI Components');
    expect(filter?.match).toEqual([]);
    expect(filter?.tags).toContain('ui');
    expect(filter?.tags).toContain('design-system');
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
