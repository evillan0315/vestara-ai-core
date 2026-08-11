/**
 * Manifest readers for different package ecosystems.
 *
 * Each reader extracts metadata from a specific manifest file type
 * and normalizes it into a common DetectedPackage shape.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DetectedPackage {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly license?: string;
  readonly entrypoint?: string;
  readonly tags: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly manifestFile: string;
  readonly rawManifest: Record<string, unknown>;
}

export interface ManifestReader {
  readonly manifestFile: string;
  detect(directory: string): boolean;
  read(directory: string): DetectedPackage | null;
}

// ─── package.json (Node/npm) ──────────────────────────────────

export class PackageJsonReader implements ManifestReader {
  readonly manifestFile = 'package.json';

  detect(directory: string): boolean {
    return fs.existsSync(path.join(directory, 'package.json'));
  }

  read(directory: string): DetectedPackage | null {
    try {
      const raw = fs.readFileSync(path.join(directory, 'package.json'), 'utf8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;

      const name = typeof pkg.name === 'string' ? pkg.name : path.basename(directory);
      const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
      const description = typeof pkg.description === 'string' ? pkg.description : undefined;
      const license = typeof pkg.license === 'string' ? pkg.license : undefined;

      let entrypoint: string | undefined;
      if (typeof pkg.bin === 'string') {
        entrypoint = pkg.bin;
      } else if (typeof pkg.bin === 'object' && pkg.bin !== null) {
        const binValues = Object.values(pkg.bin);
        if (binValues.length > 0 && typeof binValues[0] === 'string') {
          entrypoint = binValues[0];
        }
      } else if (typeof pkg.main === 'string') {
        entrypoint = pkg.main;
      }

      const tags: string[] = [];
      if (Array.isArray(pkg.keywords)) {
        for (const kw of pkg.keywords) {
          if (typeof kw === 'string') tags.push(kw);
        }
      }

      const dependencies: Record<string, string> = {};
      if (typeof pkg.dependencies === 'object' && pkg.dependencies !== null) {
        for (const [k, v] of Object.entries(pkg.dependencies)) {
          if (typeof v === 'string') dependencies[k] = v;
        }
      }

      return {
        name,
        version,
        description,
        license,
        entrypoint,
        tags,
        dependencies,
        manifestFile: 'package.json',
        rawManifest: pkg,
      };
    } catch {
      return null;
    }
  }
}

// ─── Cargo.toml (Rust) ───────────────────────────────────────

export class CargoTomlReader implements ManifestReader {
  readonly manifestFile = 'Cargo.toml';

  detect(directory: string): boolean {
    return fs.existsSync(path.join(directory, 'Cargo.toml'));
  }

  read(directory: string): DetectedPackage | null {
    try {
      const raw = fs.readFileSync(path.join(directory, 'Cargo.toml'), 'utf8');
      const parsed = parseSimpleToml(raw);
      const pkg = (parsed.package ?? {}) as Record<string, unknown>;

      const name = typeof pkg.name === 'string' ? pkg.name : path.basename(directory);
      const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
      const description = typeof pkg.description === 'string' ? pkg.description : undefined;
      const license = typeof pkg.license === 'string' ? pkg.license : undefined;

      const tags: string[] = ['rust'];
      if (typeof pkg.edition === 'string') {
        tags.push(`edition-${pkg.edition}`);
      }

      const dependencies: Record<string, string> = {};
      if (parsed.dependencies && typeof parsed.dependencies === 'object') {
        for (const [k, v] of Object.entries(parsed.dependencies)) {
          if (typeof v === 'string') {
            dependencies[k] = v;
          } else if (typeof v === 'object' && v !== null && 'version' in v) {
            dependencies[k] = String((v as Record<string, unknown>).version);
          }
        }
      }

      return {
        name,
        version,
        description,
        license,
        tags,
        dependencies,
        manifestFile: 'Cargo.toml',
        rawManifest: parsed as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }
}

// ─── pyproject.toml (Python) ─────────────────────────────────

export class PyProjectTomlReader implements ManifestReader {
  readonly manifestFile = 'pyproject.toml';

  detect(directory: string): boolean {
    return fs.existsSync(path.join(directory, 'pyproject.toml'));
  }

  read(directory: string): DetectedPackage | null {
    try {
      const raw = fs.readFileSync(path.join(directory, 'pyproject.toml'), 'utf8');
      const parsed = parseSimpleToml(raw);

      const project = parsed.project as Record<string, unknown> | undefined;
      const name = (project?.name as string) ?? path.basename(directory);
      const version = (project?.version as string) ?? '0.0.0';
      const description = project?.description as string | undefined;
      const licenseObj = project?.license;
      const license =
        typeof licenseObj === 'string'
          ? licenseObj
          : typeof licenseObj === 'object' && licenseObj !== null && 'text' in licenseObj
            ? String((licenseObj as Record<string, unknown>).text)
            : undefined;

      const tags = ['python'];

      const dependencies: Record<string, string> = {};
      if (Array.isArray(project?.dependencies)) {
        for (const dep of project.dependencies) {
          if (typeof dep === 'string') {
            const name = dep.split(/[><=!~]/)[0]?.trim() ?? dep;
            dependencies[name] = dep;
          }
        }
      }

      return {
        name,
        version,
        description,
        license,
        tags,
        dependencies,
        manifestFile: 'pyproject.toml',
        rawManifest: parsed as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }
}

// ─── go.mod (Go) ─────────────────────────────────────────────

export class GoModReader implements ManifestReader {
  readonly manifestFile = 'go.mod';

  detect(directory: string): boolean {
    return fs.existsSync(path.join(directory, 'go.mod'));
  }

  read(directory: string): DetectedPackage | null {
    try {
      const raw = fs.readFileSync(path.join(directory, 'go.mod'), 'utf8');

      const moduleMatch = raw.match(/^module\s+(.+)$/m);
      const goMatch = raw.match(/^go\s+(\d+\.\d+)/m);

      const name = moduleMatch?.[1]?.trim() ?? path.basename(directory);
      const version = '0.0.0';
      const goVersion = goMatch?.[1];

      const tags = ['go'];
      if (goVersion) tags.push(`go-${goVersion}`);

      const dependencies: Record<string, string> = {};
      const requireBlock = raw.match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        for (const line of requireBlock[1].split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[0] && parts[1]) {
            dependencies[parts[0]] = parts[1];
          }
        }
      }

      return {
        name,
        version,
        tags,
        dependencies,
        manifestFile: 'go.mod',
        rawManifest: { module: name, go: goVersion },
      };
    } catch {
      return null;
    }
  }
}

// ─── TOML parser (minimal) ───────────────────────────────────

/**
 * Minimal TOML parser sufficient for Cargo.toml and pyproject.toml.
 * Handles [table] headers, key = "string", key = number, key = true/false,
 * and inline tables { key = "value" }. Does NOT handle arrays of tables,
 * multi-line strings, or datetime types.
 */
function parseSimpleToml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let current: Record<string, unknown> = result;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // [table] header
    const tableMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (tableMatch) {
      const key = tableMatch[1].trim();
      if (!result[key]) result[key] = {};
      current = result[key] as Record<string, unknown>;
      continue;
    }

    // key = value
    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawValue = kvMatch[2].trim();
      current[key] = parseTomlValue(rawValue);
    }
  }

  return result;
}

function parseTomlValue(raw: string): unknown {
  // String
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  // Boolean
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  // Inline table
  if (raw.startsWith('{') && raw.endsWith('}')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return {};
    const obj: Record<string, unknown> = {};
    for (const part of inner.split(',')) {
      const [k, ...rest] = part.split('=');
      if (k && rest.length > 0) {
        obj[k.trim()] = parseTomlValue(rest.join('=').trim());
      }
    }
    return obj;
  }
  // Array
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseTomlValue(s.trim()));
  }
  return raw;
}

// ─── Reader registry ─────────────────────────────────────────

export const MANIFEST_READERS: ManifestReader[] = [
  new PackageJsonReader(),
  new CargoTomlReader(),
  new PyProjectTomlReader(),
  new GoModReader(),
];

export function detectPackageInDirectory(directory: string): DetectedPackage | null {
  for (const reader of MANIFEST_READERS) {
    if (reader.detect(directory)) {
      return reader.read(directory);
    }
  }
  return null;
}
