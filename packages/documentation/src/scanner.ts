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
import { DocumentationRequirementRegistry, validatePackageReadmeRequirement } from './requirements.js';

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

function applicationDirectories(root: string): string[] {
  const appsRoot = path.join(root, 'apps');
  if (!fs.existsSync(appsRoot)) return [];
  return fs
    .readdirSync(appsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(appsRoot, entry.name, 'package.json')))
    .map((entry) => `apps/${entry.name}`);
}

function packageIsPrivate(root: string, packagePath: string): boolean {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, packagePath, 'package.json'), 'utf8')) as {
      private?: boolean;
    };
    return manifest.private === true;
  } catch {
    return false;
  }
}

function missingPackageFindings(
  repository: DocumentationRepositoryConfig,
  root: string,
  packages: readonly string[],
  documents: readonly DocumentationEntity[],
): DocumentationFinding[] {
  const findings: DocumentationFinding[] = [];
  const requirements = new DocumentationRequirementRegistry();
  for (const packagePath of packages) {
    const prefix = `${packagePath}/`;
    const packageDocs = documents.filter((document) => document.path.startsWith(prefix));
    const requirement = requirements.forPackage(packageIsPrivate(root, packagePath));
    const names = {
      readme: 'README.md',
      architecture: 'ARCHITECTURE.md',
      testing: 'TESTING.md',
      api: 'API.md',
    } as const;
    for (const kind of requirement.requiredKinds) {
      if (packageDocs.some((document) => document.kind === kind)) continue;
      const name = names[kind as keyof typeof names] ?? `${kind.toUpperCase()}.md`;
      findings.push({
        id: `finding://missing/${repository.id}/${packagePath}/${kind}`,
        ruleId: 'package-required-document',
        severity: requirement.severity,
        entityId: `package://${packagePath}`,
        message: `${packagePath} is missing ${name}`,
        evidence: [{ kind: 'package', ref: packagePath }],
        suggestedAction: { operation: 'create', path: `${packagePath}/${name}` },
      });
    }
    const readme = packageDocs.find((document) => document.kind === 'readme' && document.path === `${prefix}README.md`);
    if (!readme) continue;
    for (const violation of validatePackageReadmeRequirement(readme, requirement)) {
      findings.push({
        id: `finding://${violation.ruleId}/${repository.id}/${packagePath}/${encodeURIComponent(violation.field)}`,
        ruleId: violation.ruleId,
        severity: requirement.severity,
        documentId: readme.id,
        entityId: `package://${packagePath}`,
        message: violation.message,
        evidence: [
          { kind: 'document', ref: readme.path },
          { kind: 'package', ref: packagePath },
        ],
        suggestedAction: { operation: 'update', path: readme.path },
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
      const implementation = extractImplementation(repository.path, [
        ...packages,
        ...applicationDirectories(repository.path),
      ]);
      documents.push(...repositoryDocuments);
      findings.push(...missingPackageFindings(repository, repository.path, packages, repositoryDocuments));
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
