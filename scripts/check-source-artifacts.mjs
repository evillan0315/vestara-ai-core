#!/usr/bin/env node
/**
 * check:source-artifacts — fails when generated build artifacts
 * (.js / .js.map / .d.ts) appear inside source directories.
 *
 * Generated output belongs only in approved directories such as dist/,
 * coverage/, or node_modules. A stale src/index.js can shadow the real
 * index.ts during vitest resolution, so this check protects correctness, not
 * just hygiene.
 */

import { readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedDirectoryNames = new Set(['dist', 'coverage', 'node_modules', '.git']);
const generatedPattern = /\.(?:js|js\.map|d\.ts)$/;
const roots = ['apps', 'packages'];
const results = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (allowedDirectoryNames.has(entry.name)) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (generatedPattern.test(entry.name)) results.push(full);
  }
}

for (const entry of roots) walk(resolve(root, entry));

const sourceArtifacts = results.filter((file) => {
  const relative = file.replace(root + sep, '');
  const segments = relative.split(sep);
  return segments.includes('src') || segments.includes('__tests__');
});

if (sourceArtifacts.length > 0) {
  console.error(`Source-artifact check failed: ${sourceArtifacts.length} generated file(s) under src/ or __tests__/.`);
  for (const file of sourceArtifacts.slice(0, 40)) console.error(`  - ${file.replace(root + sep, '')}`);
  if (sourceArtifacts.length > 40) console.error(`  … and ${sourceArtifacts.length - 40} more`);
  process.exit(1);
}

console.log('Source directories clean: no generated .js/.js.map/.d.ts artifacts under src/ or __tests__/.');
