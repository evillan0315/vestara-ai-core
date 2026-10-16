/**
 * @vestara/ui-components — catalog integrity contracts.
 *
 * Proves the component catalog is the single source of truth for the
 * marketplace gallery: unique ids, every group represented, and the count
 * constant agreeing with the catalog length.
 */

import { describe, expect, it } from 'vitest';
import { componentsInGroup, UI_COMPONENT_CATALOG, UI_COMPONENT_COUNT, UI_COMPONENT_GROUPS } from '../src/index';

describe('UI_COMPONENT_CATALOG', () => {
  it('has a unique id per entry', () => {
    const ids = UI_COMPONENT_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agrees with UI_COMPONENT_COUNT', () => {
    expect(UI_COMPONENT_COUNT).toBe(UI_COMPONENT_CATALOG.length);
  });

  it('populates every declared group', () => {
    for (const group of UI_COMPONENT_GROUPS) {
      expect(componentsInGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  it('groups partition the catalog exactly', () => {
    const grouped = UI_COMPONENT_GROUPS.flatMap((group) => componentsInGroup(group.id));
    expect(grouped.length).toBe(UI_COMPONENT_CATALOG.length);
  });

  it('gives every entry a name, description, and category', () => {
    for (const entry of UI_COMPONENT_CATALOG) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(['code', 'docs', 'config', 'data', 'ui']).toContain(entry.category);
    }
  });
});
