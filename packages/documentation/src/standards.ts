import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DocumentationEntity,
  DocumentationFinding,
  DocumentationInventory,
  DocumentationRuleResult,
  DocumentationSeverity,
  DocumentationValidationResult,
  DocumentationVerificationProfile,
} from './domain.js';
import { parseMarkdown } from './parser.js';

export interface DocumentationRuleContext {
  inventory: DocumentationInventory;
  proposedContent?: string;
}

export interface DocumentationRule {
  readonly id: string;
  readonly description: string;
  readonly severity: DocumentationSeverity;
  readonly profiles: readonly DocumentationVerificationProfile[];
  validate(document: DocumentationEntity, context: DocumentationRuleContext): readonly DocumentationFinding[];
}

function scalar(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

function packagePathFor(document: DocumentationEntity): string | undefined {
  return document.path.match(/^(packages\/[^/]+|packages\/(?:providers|tools)\/[^/]+|apps\/[^/]+)\//)?.[1];
}

function readJson(pathname: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(pathname, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function resolveRepositoryPath(document: DocumentationEntity, reference: string): string | undefined {
  if (path.isAbsolute(reference)) return undefined;
  const root = path.resolve(document.repositoryPath);
  const target = path.resolve(root, reference.split('#')[0].split('?')[0]);
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : undefined;
}

function resolveImplementationPath(
  document: DocumentationEntity,
  inventory: DocumentationInventory,
  reference: string,
): string | undefined {
  const identifier = scalar(document.parsed.frontmatter['implementation-repository']);
  const repository = identifier
    ? inventory.repositories.find((item) => item.id === identifier || identifier.endsWith(`/${item.id}`))
    : inventory.repositories.find((item) => item.id === document.repositoryId);
  const root = path.resolve(repository?.path ?? document.repositoryPath);
  if (path.isAbsolute(reference)) return undefined;
  const target = path.resolve(root, reference.split('#')[0].split('?')[0]);
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : undefined;
}

function resolveDocumentLink(document: DocumentationEntity, link: string): string | undefined {
  if (!link || link.startsWith('#') || /^[a-z]+:/i.test(link)) return undefined;
  const root = path.resolve(document.repositoryPath);
  const target = path.resolve(root, path.dirname(document.path), link.split('#')[0].split('?')[0]);
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : undefined;
}

function packageManifest(document: DocumentationEntity): Record<string, unknown> | undefined {
  const packagePath = packagePathFor(document);
  return packagePath ? readJson(path.join(document.repositoryPath, packagePath, 'package.json')) : undefined;
}

function approvedOwners(document: DocumentationEntity): ReadonlySet<string> {
  const registry = readJson(path.join(document.repositoryPath, 'docs', 'documentation-owners.json'));
  const owners = Array.isArray(registry?.approvedOwners)
    ? registry.approvedOwners.filter((owner): owner is string => typeof owner === 'string')
    : [];
  return new Set(owners);
}

function finding(
  rule: DocumentationRule,
  document: DocumentationEntity,
  message: string,
  ref = document.path,
): DocumentationFinding {
  return {
    id: `finding://${rule.id}/${document.repositoryId}/${document.path}/${message.length}`,
    ruleId: rule.id,
    severity: rule.severity,
    documentId: document.id,
    message,
    evidence: [{ kind: 'document', ref }],
    suggestedAction: { operation: 'update', path: document.path },
  };
}

const rules: DocumentationRule[] = [
  {
    id: 'frontmatter-required',
    description: 'Governed documents require identity, version, status, owner, and review metadata.',
    severity: 'warning',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      if (!['constitutional', 'governance', 'architecture', 'standard', 'specification'].includes(document.authority))
        return [];
      const required = ['title', 'version', 'status', 'owner'];
      return required
        .filter((key) => document.parsed.frontmatter[key] === undefined)
        .map((key) => finding(this, document, `Missing required frontmatter field: ${key}`));
    },
  },
  {
    id: 'semantic-version',
    description: 'Document versions use semantic versioning.',
    severity: 'warning',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      return document.version && !/^\d+\.\d+\.\d+$/.test(document.version)
        ? [finding(this, document, `Invalid semantic version: ${document.version}`)]
        : [];
    },
  },
  {
    id: 'review-dates',
    description: 'Review dates are valid and next review follows last review.',
    severity: 'warning',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      if (!document.lastReviewedAt || !document.nextReviewAt) return [];
      const last = Date.parse(document.lastReviewedAt);
      const next = Date.parse(document.nextReviewAt);
      if (!Number.isFinite(last) || !Number.isFinite(next) || next <= last) {
        return [finding(this, document, 'next-review must be a valid date later than last-reviewed')];
      }
      if (next < Date.now()) return [finding(this, document, 'Document review is overdue and status is stale')];
      return [];
    },
  },
  {
    id: 'implementation-reference-exists',
    description: 'Every claimed implementation reference resolves inside its configured repository.',
    severity: 'error',
    profiles: ['standard', 'strict'],
    validate(document, context) {
      const declared = document.parsed.frontmatter['implementation-ref'];
      const references = typeof declared === 'string' ? [declared] : (declared ?? []);
      return references.flatMap((reference) => {
        const target = resolveImplementationPath(document, context.inventory, reference);
        return target && fs.existsSync(target)
          ? []
          : [finding(this, document, `Implementation reference does not exist: ${reference}`, reference)];
      });
    },
  },
  {
    id: 'documentation-owner-resolves',
    description: 'Documentation owners resolve through package metadata or the approved owner registry.',
    severity: 'error',
    profiles: ['standard', 'strict'],
    validate(document) {
      const declaredOwner = scalar(document.parsed.frontmatter.owner);
      if (!declaredOwner) return [];
      const manifest = packageManifest(document);
      const documentation = manifest?.documentation;
      const packageOwner =
        documentation && typeof documentation === 'object' && 'owner' in documentation
          ? (documentation as { owner?: unknown }).owner
          : undefined;
      return packageOwner === declaredOwner || approvedOwners(document).has(declaredOwner)
        ? []
        : [finding(this, document, `Documentation owner is not approved: ${declaredOwner}`, declaredOwner)];
    },
  },
  {
    id: 'package-version-alignment',
    description: 'Package document versions match their package manifest version.',
    severity: 'error',
    profiles: ['standard', 'strict'],
    validate(document) {
      if (!document.version) return [];
      const manifest = packageManifest(document);
      if (!manifest || typeof manifest.version !== 'string') return [];
      return manifest.version === document.version
        ? []
        : [
            finding(
              this,
              document,
              `Document version ${document.version} does not match package version ${manifest.version}`,
            ),
          ];
    },
  },
  {
    id: 'closed-code-fences',
    description: 'Markdown code fences must be closed.',
    severity: 'error',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      return document.parsed.codeFences.some((fence) => !fence.closed)
        ? [finding(this, document, 'Document contains an unclosed code fence')]
        : [];
    },
  },
  {
    id: 'relative-links',
    description: 'Relative links must resolve inside a configured repository.',
    severity: 'error',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      const findings: DocumentationFinding[] = [];
      for (const link of document.parsed.links) {
        if (!link || link.startsWith('#') || /^[a-z]+:/i.test(link)) continue;
        const clean = link.split('#')[0].split('?')[0];
        const target = path.resolve(document.repositoryPath, path.dirname(document.path), clean);
        if (!target.startsWith(path.resolve(document.repositoryPath)) || !fs.existsSync(target)) {
          findings.push(finding(this, document, `Broken relative link: ${link}`, link));
        }
      }
      return findings;
    },
  },
  {
    id: 'forbidden-local-path',
    description: 'Documentation must not contain machine-specific absolute paths.',
    severity: 'error',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      return /(?:^|[\s`"'])\/(?:home|Users|private|tmp)\//m.test(document.parsed.content)
        ? [finding(this, document, 'Document contains a forbidden absolute local path')]
        : [];
    },
  },
  {
    id: 'placeholder-content',
    description: 'Placeholder prose cannot be treated as current documentation.',
    severity: 'warning',
    profiles: ['standard', 'strict'],
    validate(document) {
      return /\b(?:TODO|TBD|FIXME|lorem ipsum|coming soon)\b/i.test(document.parsed.content)
        ? [finding(this, document, 'Document contains placeholder content')]
        : [];
    },
  },
  {
    id: 'secret-exposure',
    description: 'Documentation and reports must not contain credential-shaped values.',
    severity: 'error',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      const secret = /(?:api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i;
      return secret.test(document.parsed.content)
        ? [finding(this, document, 'Document may expose a credential or secret')]
        : [];
    },
  },
  {
    id: 'implementation-reference',
    description: 'Accepted architecture claims require implementation evidence.',
    severity: 'warning',
    profiles: ['standard', 'strict'],
    validate(document) {
      const status = document.parsed.frontmatter.status;
      const implemented = document.parsed.frontmatter['implementation-status'];
      const claimsImplementation = status === 'accepted' || implemented === 'implemented' || implemented === 'verified';
      if (!claimsImplementation || document.authority !== 'architecture') return [];
      return document.implementationRefs.length === 0
        ? [finding(this, document, 'Accepted or implemented architecture has no implementation reference')]
        : [];
    },
  },
  {
    id: 'verified-claim-evidence',
    description: 'Verified claims require an existing test, evidence, or verification reference.',
    severity: 'error',
    profiles: ['strict'],
    validate(document) {
      const verified = document.parsed.frontmatter['verification-status'] === 'verified';
      if (!verified) return [];
      const references = [
        ...document.parsed.links.map((link) => ({ label: link, target: resolveDocumentLink(document, link) })),
        ...document.implementationRefs.map((reference) => ({
          label: reference.path,
          target: resolveRepositoryPath(document, reference.path),
        })),
      ];
      const hasEvidence = references.some(
        ({ label, target }) =>
          target &&
          /(?:^|[/_.-])(?:__tests__|tests?|evidence|verification)(?:[/_.-]|$)/i.test(label) &&
          fs.existsSync(target),
      );
      return hasEvidence
        ? []
        : [finding(this, document, 'Document claims verified status without existing test or evidence reference')];
    },
  },
  {
    id: 'public-api-alignment',
    description: 'Package API documents cover every symbol exported by the package barrel.',
    severity: 'error',
    profiles: ['standard', 'strict'],
    validate(document, context) {
      if (document.kind !== 'api') return [];
      const packagePath = packagePathFor(document);
      if (!packagePath) return [];
      const repository = context.inventory.repositories.find((item) => item.id === document.repositoryId);
      const symbols = repository?.implementation.publicSymbols.filter((item) => item.packagePath === packagePath) ?? [];
      return symbols
        .filter(({ symbol }) => !document.parsed.content.includes(symbol))
        .map(({ symbol }) => finding(this, document, `Public API is missing barrel export: ${symbol}`, symbol));
    },
  },
  {
    id: 'package-command-alignment',
    description: 'Documented filtered pnpm commands name scripts declared by that package.',
    severity: 'error',
    profiles: ['standard', 'strict'],
    validate(document, context) {
      const repository = context.inventory.repositories.find((item) => item.id === document.repositoryId);
      if (!repository) return [];
      const findings: DocumentationFinding[] = [];
      for (const fence of document.parsed.codeFences.filter((item) => /^(?:bash|sh|shell)$/.test(item.language))) {
        for (const match of fence.content.matchAll(/pnpm\s+--filter\s+([^\s]+)\s+([^\s;&|]+)/g)) {
          const scripts = repository.implementation.packageScripts[match[1]];
          if (scripts?.includes(match[2])) continue;
          findings.push(finding(this, document, `Documented package command does not exist: ${match[1]} ${match[2]}`));
        }
      }
      return findings;
    },
  },
  {
    id: 'related-adr-status',
    description: 'Related ADR links resolve to accepted or current decisions.',
    severity: 'error',
    profiles: ['standard', 'strict'],
    validate(document) {
      if (document.kind === 'governance') return [];
      return document.relatedAdrIds.flatMap((link) => {
        const target = resolveDocumentLink(document, link);
        if (!target || !fs.existsSync(target))
          return [finding(this, document, `Related ADR does not exist: ${link}`, link)];
        const content = fs.readFileSync(target, 'utf8');
        const status = scalar(parseMarkdown(link, content).frontmatter.status);
        return status === 'accepted' || status === 'current'
          ? []
          : [finding(this, document, `Related ADR is not accepted or current: ${link}`, link)];
      });
    },
  },
  {
    id: 'frontmatter-classification-alignment',
    description: 'Declared kind and authority agree with deterministic path classification.',
    severity: 'error',
    profiles: ['fast', 'standard', 'strict'],
    validate(document) {
      const declaredKind = scalar(document.parsed.frontmatter.kind);
      const declaredAuthority = scalar(document.parsed.frontmatter.authority);
      const findings: DocumentationFinding[] = [];
      if (declaredKind && declaredKind !== document.kind)
        findings.push(
          finding(this, document, `Declared kind ${declaredKind} does not match classified kind ${document.kind}`),
        );
      if (declaredAuthority && declaredAuthority !== document.authority)
        findings.push(
          finding(
            this,
            document,
            `Declared authority ${declaredAuthority} does not match resolved authority ${document.authority}`,
          ),
        );
      return findings;
    },
  },
];

export class DocumentationStandardsRegistry {
  private readonly rules = new Map<string, DocumentationRule>();

  constructor(initial: readonly DocumentationRule[] = rules) {
    for (const rule of initial) this.register(rule);
  }

  register(rule: DocumentationRule): void {
    this.rules.set(rule.id, rule);
  }

  all(): readonly DocumentationRule[] {
    return [...this.rules.values()];
  }

  validate(
    document: DocumentationEntity,
    inventory: DocumentationInventory,
    profile: DocumentationVerificationProfile,
  ): DocumentationValidationResult {
    const ruleResults: DocumentationRuleResult[] = this.all()
      .filter((rule) => rule.profiles.includes(profile))
      .map((rule) => {
        const findings = rule.validate(document, { inventory });
        return { ruleId: rule.id, passed: findings.length === 0, findings };
      });
    return { profile, valid: ruleResults.every((result) => result.passed), ruleResults };
  }
}
