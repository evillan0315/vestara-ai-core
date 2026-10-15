import { describe, expect, it } from 'vitest';
import { buildPaletteIndex } from '../CommandPalette.js';
import { EXTRACTOR_COMPONENT_FIXTURES } from '../extractor.fixtures.js';

describe('buildPaletteIndex', () => {
  it('indexes files, props, and actions', () => {
    const index = buildPaletteIndex(EXTRACTOR_COMPONENT_FIXTURES.slice(0, 1));
    const kinds = index.map((e) => e.kind);
    expect(kinds).toContain('file');
    expect(kinds).toContain('prop');
    expect(kinds).toContain('action');
    const file = index.find((e) => e.kind === 'file');
    expect(file?.path).toBe('components/FileIcon.tsx');
    const prop = index.find((e) => e.kind === 'prop' && e.title === 'category');
    expect(prop?.subtitle).toContain('FileIcon');
    const actions = index.filter((e) => e.kind === 'action').map((e) => e.action);
    expect(actions).toEqual(['extract-all', 'export-react', 'copy-tokens']);
  });
});
