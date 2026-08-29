#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedName = 'tsconfig.reference.json';
const mode = process.argv[2] ?? '--check';
if (!['--check', '--generate'].includes(mode)) {
  console.error('Usage: node scripts/workspace-architecture.mjs [--check|--generate]');
  process.exit(2);
}

const children = (path) =>
  existsSync(path)
    ? readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(path, entry.name))
    : [];
const directories = [
  ...children(resolve(root, 'apps')),
  ...children(resolve(root, 'packages')),
  ...children(resolve(root, 'packages/providers')),
  ...children(resolve(root, 'packages/tools')),
];
const projects = directories
  .filter((path) => existsSync(resolve(path, 'package.json')) && existsSync(resolve(path, 'tsconfig.json')))
  .map((path) => ({ path, manifest: JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8')) }))
  .map((project) => ({ ...project, name: project.manifest.name }))
  .filter((project) => project.name)
  .sort((a, b) => a.name.localeCompare(b.name));
const byName = new Map(projects.map((project) => [project.name, project]));
const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];
for (const project of projects) {
  const declared = fields.flatMap((field) => Object.keys(project.manifest[field] ?? {}));
  project.internalDependencies = [...new Set(declared)].filter((name) => byName.has(name)).sort();
  project.buildable = project.name !== '@vestara/workspace-ui';
}

const filesUnder = (path) => {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(path, entry.name);
    if (entry.isDirectory()) return filesUnder(target);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [target] : [];
  });
};
const errors = [];
const workspaceFacadeConsumers = new Set(['@vestara/evaluation']);
const importPattern = /(?:from\s*|import\s*\(|require\s*\()\s*['"](@vestara\/[^'"]+)['"]/g;
for (const project of projects) {
  const declared = new Set(fields.flatMap((field) => Object.keys(project.manifest[field] ?? {})));
  for (const file of filesUnder(resolve(project.path, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(importPattern)) {
      const specifier = match[1];
      const dependency = specifier.split('/').slice(0, 2).join('/');
      if (!byName.has(dependency) || dependency === project.name) continue;
      if (specifier !== dependency) errors.push(`${relative(root, file)}: deep internal import '${specifier}'`);
      if (!declared.has(dependency))
        errors.push(`${relative(root, file)}: '${dependency}' is not declared in ${project.name}`);
    }
  }
  const projectPath = relative(root, project.path).split(sep).join('/');
  if (
    projectPath.startsWith('packages/') &&
    project.internalDependencies.includes('@vestara/workspace') &&
    !workspaceFacadeConsumers.has(project.name)
  ) {
    errors.push(`${project.name}: packages must not depend on the @vestara/workspace integration facade`);
  }
  if (projectPath.startsWith('packages/')) {
    for (const dependency of project.internalDependencies) {
      if (relative(root, byName.get(dependency).path).split(sep).join('/').startsWith('apps/')) {
        errors.push(`${project.name}: package must not depend on application ${dependency}`);
      }
    }
  }
}

const state = new Map();
const stack = [];
const visit = (project) => {
  if (state.get(project.name) === 'done') return;
  if (state.get(project.name) === 'visiting') {
    errors.push(`dependency cycle: ${[...stack.slice(stack.indexOf(project.name)), project.name].join(' -> ')}`);
    return;
  }
  state.set(project.name, 'visiting');
  stack.push(project.name);
  for (const dependency of project.internalDependencies) visit(byName.get(dependency));
  stack.pop();
  state.set(project.name, 'done');
};
for (const project of projects) visit(project);
if (errors.length) {
  console.error(`Dependency boundary check failed with ${new Set(errors).size} issue(s):`);
  for (const error of [...new Set(errors)].sort()) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Dependency boundaries valid across ${projects.length} workspace projects.`);

if (mode === '--generate') {
  const buildable = projects.filter((project) => project.buildable);
  for (const project of buildable) {
    const references = project.internalDependencies
      .map((name) => byName.get(name))
      .filter((dependency) => dependency.buildable)
      .map((dependency) => ({
        path: relative(project.path, resolve(dependency.path, generatedName)).split(sep).join('/'),
      }));
    const config = {
      extends: './tsconfig.json',
      compilerOptions: { composite: true, tsBuildInfoFile: './dist/.tsbuildinfo' },
      references,
    };
    writeFileSync(resolve(project.path, generatedName), `${JSON.stringify(config, null, 2)}\n`);
  }
  const solution = {
    files: [],
    references: buildable.map((project) => ({
      path: relative(root, resolve(project.path, generatedName)).split(sep).join('/'),
    })),
  };
  writeFileSync(resolve(root, 'tsconfig.references.json'), `${JSON.stringify(solution, null, 2)}\n`);
  console.log(`Generated project references for ${buildable.length} buildable projects.`);
}
