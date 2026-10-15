import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  NPM_INSTALL_COMMAND,
  buildBarrel,
  buildFileList,
  buildZip,
  fileNameFor,
  renderClean,
} from '../exportLib.js';
import { EXTRACTOR_COMPONENT_FIXTURES } from '../extractor.fixtures.js';

const COMPONENTS = EXTRACTOR_COMPONENT_FIXTURES.slice(0, 2);

describe('renderClean', () => {
  it('passes React through and appends a Props type for TypeScript', () => {
    const [first] = COMPONENTS;
    if (!first) throw new Error('fixture missing');
    expect(renderClean(first, 'react')).toContain('export function');
    const ts = renderClean(first, 'typescript');
    expect(ts).toContain(`export type ${first.name}Props`);
    expect(ts).toContain('category: FileCategory;');
  });

  it('wraps Vue output in a script-setup SFC', () => {
    const [first] = COMPONENTS;
    if (!first) throw new Error('fixture missing');
    const vue = renderClean(first, 'vue');
    expect(vue).toContain('<script setup>');
    expect(vue).toContain('defineProps');
    expect(vue).toContain('<template>');
  });

  it('maps file extensions per format', () => {
    const [first] = COMPONENTS;
    if (!first) throw new Error('fixture missing');
    expect(fileNameFor(first, 'react')).toBe('FileIcon.jsx');
    expect(fileNameFor(first, 'typescript')).toBe('FileIcon.tsx');
    expect(fileNameFor(first, 'vue')).toBe('FileIcon.vue');
    expect(NPM_INSTALL_COMMAND).toContain('vestara-ui-extract.zip');
  });

  it('defaults to TypeScript (.tsx) when no format specified', () => {
    const [first] = COMPONENTS;
    if (!first) throw new Error('fixture missing');
    expect(fileNameFor(first, 'typescript')).toBe('FileIcon.tsx');
  });
});

describe('buildBarrel', () => {
  it('re-exports every component', () => {
    const barrel = buildBarrel(COMPONENTS, 'react');
    expect(barrel).toContain(`export { default as FileIcon } from './components/FileIcon.jsx';`);
    expect(barrel).toContain(`export { default as TreeNode } from './components/TreeNode.jsx';`);
  });

  it('defaults to TypeScript (.tsx) barrel', () => {
    const barrel = buildBarrel(COMPONENTS, 'typescript');
    expect(barrel).toContain(`export { default as FileIcon } from './components/FileIcon.tsx';`);
    expect(barrel).toContain(`export { default as TreeNode } from './components/TreeNode.tsx';`);
  });
});

describe('buildZip', () => {
  it('round-trips components, barrel, manifest, and tokens', async () => {
    const files = buildFileList(COMPONENTS, 'typescript', ':root{}', '{"ok":true}', true);
    const bytes = await buildZip(files);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/')).sort();
    expect(names).toEqual([
      'README.txt',
      'components/FileIcon.tsx',
      'components/TreeNode.tsx',
      'index.js',
      'manifest.json',
      'package.json',
      'tokens.css',
    ]);
    const manifest = await zip.files['manifest.json']?.async('string');
    expect(manifest).toBe('{"ok":true}');
  });

  it('omits tokens when toggled off', async () => {
    const files = buildFileList(COMPONENTS, 'vue', ':root{}', '{}', false);
    const zip = await JSZip.loadAsync(await buildZip(files));
    expect(zip.files['tokens.css']).toBeUndefined();
    expect(zip.files['components/FileIcon.vue']).toBeDefined();
  });
});
