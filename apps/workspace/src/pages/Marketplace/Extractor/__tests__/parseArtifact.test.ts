/**
 * parseArtifactHtml tests — samples mirror the reference artifact's real
 * patterns (Tailwind banner, :root tokens, bundler helpers, minified
 * component vars, React version assignment).
 */

import { describe, expect, it } from 'vitest';
import { COMPONENT_REGISTRY } from '../componentRegistry.js';
import { parseArtifactHtml } from '../parseArtifact.js';

const SAMPLE = [
  '<!doctype html><html><head>',
  '<style>/*! tailwindcss v3.4.18 | MIT License | https://tailwindcss.com*/',
  ':root{--bg:#0a1214;--surface:#0f1b1d;--teal:#2de8c3;--text:#dbe8e6}',
  '.pointer-events-none{pointer-events:none}</style>',
  '</head><body>',
  '<script type="module">',
  'var us=Object.create;',
  'var kl=(e,n)=>()=>(n||e((n={exports:{}}).exports,n),n.exports);',
  'var Je=({category:e="other",open:n,extra:z=1})=>{return e};',
  'var Tp=({node:e,depth:n=0})=>{return e};',
  'Ns.version="18.3.1";',
  '</script>',
  '</body></html>',
].join('');

describe('parseArtifactHtml', () => {
  it('maps known bundle vars to real components and skips internals', () => {
    const result = parseArtifactHtml(SAMPLE);
    expect(result.bundleKb).toBeGreaterThan(0);
    expect(result.cssKb).toBeGreaterThan(0);
    expect(result.varNames).toEqual(['Je', 'Tp']);
    expect(result.componentCount).toBe(2);
    expect(result.unmappedVarCount).toBe(2);

    const fileIcon = result.components[0];
    expect(fileIcon?.name).toBe('FileIcon');
    expect(fileIcon?.file).toBe('FileIcon.tsx');
    expect(fileIcon?.category).toBe('ui');
    expect(fileIcon?.props.map((p) => p.name)).toEqual(['category', 'open', 'className', 'extra']);
    expect(fileIcon?.source.original).toContain('var Je=');
    expect(fileIcon?.source.clean).toContain('export interface FileIconProps');
    const extra = fileIcon?.props.find((p) => p.name === 'extra');
    expect(extra).toMatchObject({ type: 'unknown', defaultValue: '1', description: 'Detected in bundle signature.' });

    expect(result.components[1]?.name).toBe('TreeNode');
    expect(result.components[1]?.file).toBe('TreeNode.tsx');
  });

  it('detects framework versions and extracts the :root token block', () => {
    const result = parseArtifactHtml(SAMPLE);
    expect(result.frameworks).toEqual({ react: '18.3.1', tailwind: '3.4.18' });
    expect(result.tokensCss).toContain('--bg:#0a1214');
    expect(result.tokensCss).not.toContain('pointer-events');
  });

  it('builds the file tree and manifest from mapped components', () => {
    const result = parseArtifactHtml(SAMPLE);
    expect(result.fileTree.map((n) => n.path)).toEqual(['components/', 'tokens.css', 'manifest.json']);
    expect(result.fileTree[0]?.children?.map((c) => c.name)).toEqual(['FileIcon.tsx', 'TreeNode.tsx']);
    expect(result.manifestJson).toContain('"componentCount": 2');
    expect(result.manifestJson).toContain('"status": "parsed"');
  });

  it('never throws on malformed input', () => {
    const result = parseArtifactHtml('');
    expect(result.componentCount).toBe(0);
    expect(result.frameworks).toEqual({ react: null, tailwind: null });
    expect(result.bundleKb).toBeGreaterThan(0);
  });
});

describe('COMPONENT_REGISTRY', () => {
  it('covers the full demoed library with unique files', () => {
    const vars = Object.keys(COMPONENT_REGISTRY);
    expect(vars.length).toBeGreaterThanOrEqual(44);
    const files = vars.map((v) => COMPONENT_REGISTRY[v]?.file);
    expect(new Set(files).size).toBe(vars.length);
    expect(COMPONENT_REGISTRY['Je']?.name).toBe('FileIcon');
    expect(COMPONENT_REGISTRY['Np']?.name).toBe('GitStatusCard');
    expect(COMPONENT_REGISTRY['Ef']?.name).toBe('App');
  });
});
