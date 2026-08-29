import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MarketplaceCatalog } from '../src/catalog';
import { DirectoryDetector } from '../src/detector';
import { generateManifest } from '../src/detector/generator';
import {
  CargoTomlReader,
  detectPackageInDirectory,
  GoModReader,
  PackageJsonReader,
  PyProjectTomlReader,
} from '../src/detector/manifest-readers';
import { mapPackageType } from '../src/detector/type-mapper';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-detector-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Manifest Readers ────────────────────────────────────────

describe('PackageJsonReader', () => {
  const reader = new PackageJsonReader();

  it('detects package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    expect(reader.detect(tmpDir)).toBe(true);
  });

  it('returns null for missing package.json', () => {
    expect(reader.detect(tmpDir)).toBe(false);
  });

  it('reads package metadata', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-package',
        version: '1.2.3',
        description: 'A test package',
        license: 'MIT',
        main: 'index.js',
        keywords: ['test', 'example'],
        dependencies: { foo: '^1.0.0' },
      }),
    );
    const result = reader.read(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-package');
    expect(result!.version).toBe('1.2.3');
    expect(result!.description).toBe('A test package');
    expect(result!.license).toBe('MIT');
    expect(result!.entrypoint).toBe('index.js');
    expect(result!.tags).toEqual(['test', 'example']);
    expect(result!.dependencies).toEqual({ foo: '^1.0.0' });
  });

  it('reads bin field as entrypoint', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cli-tool', version: '1.0.0', bin: './bin/cli.js' }),
    );
    const result = reader.read(tmpDir);
    expect(result!.entrypoint).toBe('./bin/cli.js');
  });
});

describe('CargoTomlReader', () => {
  const reader = new CargoTomlReader();

  it('detects Cargo.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '');
    expect(reader.detect(tmpDir)).toBe(true);
  });

  it('reads Rust package metadata', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'Cargo.toml'),
      `[package]
name = "my-crate"
version = "0.5.0"
description = "A Rust crate"
license = "Apache-2.0"
edition = "2021"

[dependencies]
serde = "1.0"
`,
    );
    const result = reader.read(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-crate');
    expect(result!.version).toBe('0.5.0');
    expect(result!.description).toBe('A Rust crate');
    expect(result!.license).toBe('Apache-2.0');
    expect(result!.tags).toContain('rust');
    expect(result!.dependencies).toHaveProperty('serde');
  });
});

describe('PyProjectTomlReader', () => {
  const reader = new PyProjectTomlReader();

  it('detects pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '');
    expect(reader.detect(tmpDir)).toBe(true);
  });

  it('reads Python package metadata', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `[project]
name = "my-package"
version = "2.0.0"
description = "A Python package"
license = { text = "MIT" }
dependencies = ["requests>=2.0", "click"]
`,
    );
    const result = reader.read(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-package');
    expect(result!.version).toBe('2.0.0');
    expect(result!.license).toBe('MIT');
    expect(result!.tags).toContain('python');
    expect(result!.dependencies).toHaveProperty('requests');
  });
});

describe('GoModReader', () => {
  const reader = new GoModReader();

  it('detects go.mod', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), '');
    expect(reader.detect(tmpDir)).toBe(true);
  });

  it('reads Go module metadata', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'go.mod'),
      `module github.com/example/my-module

go 1.21

require (
	github.com/foo/bar v1.2.3
	github.com/baz/qux v0.5.0
)
`,
    );
    const result = reader.read(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('github.com/example/my-module');
    expect(result!.tags).toContain('go');
    expect(result!.dependencies).toHaveProperty('github.com/foo/bar');
  });
});

// ─── detectPackageInDirectory ────────────────────────────────

describe('detectPackageInDirectory', () => {
  it('detects a Node.js package', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'node-pkg', version: '1.0.0' }));
    const result = detectPackageInDirectory(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('node-pkg');
  });

  it('returns null for empty directory', () => {
    const result = detectPackageInDirectory(tmpDir);
    expect(result).toBeNull();
  });
});

// ─── Type Mapper ─────────────────────────────────────────────

describe('mapPackageType', () => {
  it('maps CLI tool to plugin', () => {
    const type = mapPackageType({
      name: 'my-cli-tool',
      version: '1.0.0',
      tags: [],
      dependencies: {},
      manifestFile: 'package.json',
      rawManifest: { bin: './bin/cli.js' },
    });
    expect(type).toBe('plugin');
  });

  it('maps theme package', () => {
    const type = mapPackageType({
      name: 'dark-theme',
      version: '1.0.0',
      tags: [],
      dependencies: {},
      manifestFile: 'package.json',
      rawManifest: {},
    });
    expect(type).toBe('theme');
  });

  it('maps default to module', () => {
    const type = mapPackageType({
      name: 'some-lib',
      version: '1.0.0',
      tags: [],
      dependencies: {},
      manifestFile: 'package.json',
      rawManifest: {},
    });
    expect(type).toBe('module');
  });

  it('respects explicit vestara type', () => {
    const type = mapPackageType({
      name: 'custom',
      version: '1.0.0',
      tags: [],
      dependencies: {},
      manifestFile: 'package.json',
      rawManifest: { vestara: { type: 'agent-pack' } },
    });
    expect(type).toBe('agent-pack');
  });
});

// ─── Generator ───────────────────────────────────────────────

describe('generateManifest', () => {
  it('generates a valid manifest', () => {
    const pkgDir = path.join(tmpDir, 'my-pkg');
    fs.mkdirSync(pkgDir);
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {};');

    const detected = {
      name: 'my-pkg',
      version: '1.0.0',
      description: 'My package',
      tags: ['test'],
      dependencies: {},
      manifestFile: 'package.json',
      rawManifest: {},
    };

    const result = generateManifest(detected, pkgDir, { publisherId: 'test-pub' });

    expect(result.manifest.id).toBe('test-pub/my-pkg');
    expect(result.manifest.name).toBe('my-pkg');
    expect(result.manifest.version).toBe('1.0.0');
    expect(result.manifest.publisher.id).toBe('test-pub');
    expect(result.manifest.integrity.digest).toBeTruthy();
    expect(result.manifest.integrity.algorithm).toBe('sha256');

    // Verify vestara-package.json was written
    expect(fs.existsSync(result.manifestPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    expect(written.id).toBe('test-pub/my-pkg');
  });
});

// ─── DirectoryDetector ───────────────────────────────────────

describe('DirectoryDetector', () => {
  it('detects packages in a flat directory', async () => {
    // Create two packages
    const pkgA = path.join(tmpDir, 'pkg-a');
    fs.mkdirSync(pkgA);
    fs.writeFileSync(
      path.join(pkgA, 'package.json'),
      JSON.stringify({ name: 'pkg-a', version: '1.0.0', description: 'Package A' }),
    );
    fs.writeFileSync(path.join(pkgA, 'index.js'), 'module.exports = {};');

    const pkgB = path.join(tmpDir, 'pkg-b');
    fs.mkdirSync(pkgB);
    fs.writeFileSync(path.join(pkgB, 'Cargo.toml'), `[package]\nname = "pkg-b"\nversion = "0.1.0"\n`);

    const detector = new DirectoryDetector({ publisherId: 'test' });
    const report = await detector.detect(tmpDir);

    expect(report.detected).toBe(2);
    expect(report.results).toHaveLength(2);
    expect(report.results.map((r) => r.detected.name).sort()).toEqual(['pkg-a', 'pkg-b']);
  });

  it('skips directories with existing vestara-package.json', async () => {
    const pkg = path.join(tmpDir, 'existing');
    fs.mkdirSync(pkg);
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'existing', version: '1.0.0' }));
    fs.writeFileSync(path.join(pkg, VESTARA_PACKAGE_MANIFEST), '{}');

    const detector = new DirectoryDetector({ publisherId: 'test', skipExisting: true });
    const report = await detector.detect(tmpDir);

    expect(report.detected).toBe(0);
  });

  it('detectAndRegister adds to catalog', async () => {
    const pkg = path.join(tmpDir, 'my-lib');
    fs.mkdirSync(pkg);
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'my-lib', version: '2.0.0', description: 'My library' }),
    );
    fs.writeFileSync(path.join(pkg, 'index.js'), 'module.exports = {};');

    const catalog = new MarketplaceCatalog();
    const detector = new DirectoryDetector({ publisherId: 'test-pub' });
    const report = await detector.detectAndRegister(tmpDir, catalog);

    expect(report.registered).toBe(1);
    expect(report.results[0].registered).toBe(true);

    // Verify catalog has the asset
    const asset = catalog.get('my-lib', 'test-pub');
    expect(asset).not.toBeNull();
    expect(asset!.asset.latestVersion).toBe('2.0.0');
  });

  it('respects maxDepth', async () => {
    // Create nested packages
    const deep = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e', 'f', 'g');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'package.json'), JSON.stringify({ name: 'deep-pkg', version: '1.0.0' }));

    const detector = new DirectoryDetector({ publisherId: 'test', maxDepth: 3 });
    const report = await detector.detect(tmpDir);

    // The deep package should not be found at depth 7
    expect(report.detected).toBe(0);
  });

  it('skips node_modules', async () => {
    const nm = path.join(tmpDir, 'node_modules', 'some-pkg');
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(path.join(nm, 'package.json'), JSON.stringify({ name: 'some-pkg', version: '1.0.0' }));

    const detector = new DirectoryDetector({ publisherId: 'test' });
    const report = await detector.detect(tmpDir);

    expect(report.detected).toBe(0);
  });
});
