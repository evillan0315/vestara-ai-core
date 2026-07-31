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
      return [];
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
    description: 'Verified claims require an evidence or verification reference.',
    severity: 'error',
    profiles: ['strict'],
    validate(document) {
      const verified = document.parsed.frontmatter['verification-status'] === 'verified';
      if (!verified) return [];
      const hasEvidence = document.parsed.links.some((link) => /evidence|verification|test/i.test(link));
      return hasEvidence ? [] : [finding(this, document, 'Document claims verified status without evidence reference')];
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
