/**
 * Marketplace UI Components — preview smoke test.
 *
 * Statically renders every preview in `COMPONENT_PREVIEWS` to catch
 * render-time crashes (e.g. a component invoked as a function instead of
 * rendered) before they reach the browser. The catalog is the source of
 * truth, so a missing preview fails loudly here.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UI_COMPONENT_CATALOG } from '@vestara/ui-components';
import { COMPONENT_PREVIEWS } from '../src/pages/Marketplace/components/ComponentPreviews';

describe('Marketplace UI Components previews', () => {
  it('exposes a preview for every catalogued component', () => {
    const missing = UI_COMPONENT_CATALOG.filter((entry) => !COMPONENT_PREVIEWS[entry.id]).map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  for (const entry of UI_COMPONENT_CATALOG) {
    it(`renders ${entry.id} without throwing`, () => {
      const Preview = COMPONENT_PREVIEWS[entry.id];
      expect(Preview).toBeDefined();
      const html = renderToStaticMarkup(<Preview />);
      expect(typeof html).toBe('string');
    });
  }
});
