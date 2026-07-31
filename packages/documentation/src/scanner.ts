import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DocumentationEntity,
  DocumentationFinding,
  DocumentationInventory,
  DocumentationRepositoryConfig,
  DocumentationRepositoryInventory,
} from './domain.js';
import { detectImplementationDrift, extractImplementation } from './drift.js';
import { createDocumentEntity } from './parser.js';

const SKIP_DIRECTORIES = new Set(['.git', '.vestara', 'node_modules', 'dist', 'coverage', '.cache']);

function walk(root: string, current = root): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walk(root, target));
    else if (entry.isFile() && /\.(?:md|mdx)$/i.test(entry.name)) files.push(path.relative(root, target));
  }
  return files;
}

function packageDirectories(root: string): string[] {
  const packageRoot = path.join(root, 'packages');
  if (!fs.existsSync(packageRoot)) return [];
  const found: string[] = [];
  const visit = (directory: string, depth: number): void => {
    if (depth > 2) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(directory, entry.name);
      if (fs.existsSync(path.join(target, 'package.json'))) found.push(path.relative(root, target));
      else visit(target, depth + 1);
    }
  };
  visit(packageRoot, 0);
  return found;
}

function missingPackageFindings(
  repository: DocumentationRepositoryConfig,
  packages: readonly string[],
  documents: readonly DocumentationEntity[],
): DocumentationFinding[] {
  const findings: DocumentationFinding[] = [];
  for (const packagePath of packages) {
    const prefix = `${packagePath}/`;
    const packageDocs = documents.filter((document) => document.path.startsWith(prefix));
    for (const requirement of [
      { kind: 'readme', name: 'README.md' },
      { kind: 'architecture', name: 'ARCHITECTURE.md' },
      { kind: 'testing', name: 'TESTING.md' },
    ] as const) {
      if (packageDocs.some((document) => document.kind === requirement.kind)) continue;
      findings.push({
        id: `finding://missing/${repository.id}/${packagePath}/${requirement.kind}`,
        ruleId: 'package-required-document',
        severity: requirement.kind === 'readme' ? 'error' : 'warning',
        entityId: `package://${packagePath}`,
        message: `${packagePath} is missing ${requirement.name}`,
        evidence: [{ kind: 'package', ref: packagePath }],
        suggestedAction: { operation: 'create', path: `${packagePath}/${requirement.name}` },
      });
    }
  }
  return findings;
}

export class DocumentationScanner {
  scan(repositories: readonly DocumentationRepositoryConfig[]): DocumentationInventory {
    const documents: DocumentationEntity[] = [];
    const repositoryInventories: DocumentationRepositoryInventory[] = [];
    const findings: DocumentationFinding[] = [];
    for (const repository of repositories) {
      if (!fs.existsSync(repository.path)) {
        findings.push({
          id: `finding://repository-missing/${repository.id}`,
          ruleId: 'repository-exists',
          severity: 'error',
          message: `Documentation repository is unavailable: ${repository.path}`,
          evidence: [{ kind: 'file', ref: repository.path }],
        });
        continue;
      }
      const repositoryDocuments = walk(repository.path)
        .sort()
        .map((relativePath) =>
          createDocumentEntity(
            repository,
            relativePath.split(path.sep).join('/'),
            fs.readFileSync(path.join(repository.path, relativePath), 'utf8'),
          ),
        );
      const packages = packageDirectories(repository.path).map((item) => item.split(path.sep).join('/'));
      const implementation = extractImplementation(repository.path, packages);
      documents.push(...repositoryDocuments);
      findings.push(...missingPackageFindings(repository, packages, repositoryDocuments));
      findings.push(...detectImplementationDrift(repositoryDocuments, implementation));
      repositoryInventories.push({
        id: repository.id,
        path: repository.path,
        documents: repositoryDocuments.length,
        packages,
        implementation,
      });
    }
    const errorCount = findings.filter((finding) => finding.severity === 'error').length;
    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
    return {
      generatedAt: new Date().toISOString(),
      repositories: repositoryInventories,
      documents,
      findings,
      summary: {
        repositories: repositoryInventories.length,
        documents: documents.length,
        current: documents.filter((document) => document.status === 'current').length,
        stale: documents.filter((document) => document.status === 'stale').length,
        invalid: documents.filter((document) => document.status === 'invalid').length,
        missing: findings.filter((finding) => finding.ruleId === 'package-required-document').length,
        errors: errorCount,
        warnings: warningCount,
      },
    };
  }
}
