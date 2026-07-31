import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocumentationEntity, DocumentationFinding, DocumentationImplementationInventory } from './domain.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP = new Set(['node_modules', 'dist', '__tests__', '.git', '.vestara']);

function sourceFiles(root: string, current = root): string[] {
  const result: string[] = [];
  if (!fs.existsSync(current)) return result;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(root, absolute));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)))
      result.push(path.relative(root, absolute));
  }
  return result;
}

function manifest(root: string, packagePath: string): { name?: string; scripts?: Record<string, string> } {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, packagePath, 'package.json'), 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
    };
  } catch {
    return {};
  }
}

export function extractImplementation(root: string, packages: readonly string[]): DocumentationImplementationInventory {
  const packageScripts: Record<string, readonly string[]> = {};
  const packageNames: string[] = [];
  for (const packagePath of packages) {
    const data = manifest(root, packagePath);
    packageNames.push(data.name ?? packagePath);
    packageScripts[data.name ?? packagePath] = Object.keys(data.scripts ?? {}).sort();
  }

  const publicSymbols: { packagePath: string; symbol: string; sourcePath: string }[] = [];
  const apiRoutes: { method: string; path: string; sourcePath: string }[] = [];
  const cliCommands = new Set<string>();
  for (const relative of sourceFiles(root)) {
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    const packagePath = relative.match(/^(packages\/[^/]+|packages\/(?:providers|tools)\/[^/]+|apps\/[^/]+)/)?.[1];
    if (packagePath && /\/src\/index\.tsx?$/.test(relative)) {
      for (const match of content.matchAll(
        /export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const)\s+([A-Za-z_$][\w$]*)/g,
      )) {
        publicSymbols.push({ packagePath, symbol: match[1], sourcePath: relative });
      }
      for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const item of match[1].split(',')) {
          const symbol = item.trim().split(/\s+as\s+/)[1] ?? item.trim().split(/\s+as\s+/)[0];
          if (/^[A-Za-z_$][\w$]*$/.test(symbol)) publicSymbols.push({ packagePath, symbol, sourcePath: relative });
        }
      }
    }
    for (const match of content.matchAll(
      /method\s*===\s*['"](GET|POST|PUT|PATCH|DELETE)['"][\s\S]{0,100}?(?:p|pathname|suffix)\s*===\s*['"]([^'"]+)['"]/g,
    )) {
      apiRoutes.push({ method: match[1], path: match[2], sourcePath: relative });
    }
    for (const match of content.matchAll(/registry\.register\(['"]([^'"]+)['"]/g)) cliCommands.add(match[1]);
    for (const match of content.matchAll(/args\[0\]\s*===\s*['"]([^'"]+)['"]/g)) cliCommands.add(match[1]);
  }
  return {
    packages: packageNames.sort(),
    packageScripts,
    publicSymbols: publicSymbols.sort((a, b) =>
      `${a.packagePath}:${a.symbol}`.localeCompare(`${b.packagePath}:${b.symbol}`),
    ),
    apiRoutes: apiRoutes.sort((a, b) => `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`)),
    cliCommands: [...cliCommands].sort(),
  };
}

function driftFinding(
  ruleId: string,
  document: DocumentationEntity,
  message: string,
  kind: 'package' | 'route' | 'command' | 'symbol',
  ref: string,
): DocumentationFinding {
  return {
    id: `finding://${ruleId}/${document.repositoryId}/${document.path}/${encodeURIComponent(ref)}`,
    ruleId,
    severity: 'error',
    documentId: document.id,
    message,
    evidence: [
      { kind, ref },
      { kind: 'document', ref: document.path },
    ],
    suggestedAction: { operation: 'update', path: document.path },
  };
}

export function detectImplementationDrift(
  documents: readonly DocumentationEntity[],
  implementation: DocumentationImplementationInventory,
): DocumentationFinding[] {
  const findings: DocumentationFinding[] = [];
  const packageSet = new Set(implementation.packages);
  const commandSet = new Set(implementation.cliCommands);
  const routeSet = new Set(implementation.apiRoutes.map((route) => `${route.method} ${route.path}`));
  for (const document of documents) {
    const content = document.parsed.content;
    for (const match of content.matchAll(/@vestara\/[a-z0-9-]+/gi)) {
      if (!packageSet.has(match[0]))
        findings.push(
          driftFinding(
            'implementation-package-exists',
            document,
            `Document references unknown package ${match[0]}`,
            'package',
            match[0],
          ),
        );
    }
    for (const match of content.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[A-Za-z0-9_./:{}-]+)/g)) {
      const ref = `${match[1]} ${match[2]}`;
      if (!routeSet.has(ref))
        findings.push(
          driftFinding(
            'implementation-route-exists',
            document,
            `Document references unknown API route ${ref}`,
            'route',
            ref,
          ),
        );
    }
    for (const match of content.matchAll(/\bvestara\s+([a-z][a-z0-9-]*)/g)) {
      if (!commandSet.has(match[1]))
        findings.push(
          driftFinding(
            'implementation-command-exists',
            document,
            `Document references unknown CLI command ${match[1]}`,
            'command',
            match[1],
          ),
        );
    }
  }
  const apiDocs = documents.filter((document) => document.kind === 'api' || /api|reference/i.test(document.path));
  const apiText = apiDocs.map((document) => document.parsed.content).join('\n');
  for (const exported of implementation.publicSymbols) {
    if (!apiText.includes(exported.symbol)) {
      findings.push({
        id: `finding://public-symbol-documented/${exported.packagePath}/${exported.symbol}`,
        ruleId: 'public-symbol-documented',
        severity: 'warning',
        entityId: `symbol://${exported.packagePath}/${exported.symbol}`,
        message: `Public symbol ${exported.symbol} has no API/reference documentation`,
        evidence: [{ kind: 'symbol', ref: exported.symbol, detail: exported.sourcePath }],
        suggestedAction: { operation: 'create', path: `${exported.packagePath}/API.md` },
      });
    }
  }
  return findings;
}
