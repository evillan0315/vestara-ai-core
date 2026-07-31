import { createHash } from 'node:crypto';
import type {
  DocumentationAuthority,
  DocumentationEntity,
  DocumentationImplementationRef,
  DocumentationKind,
  DocumentationRepositoryConfig,
  DocumentationStatus,
  ParsedDocument,
} from './domain.js';

function parseScalar(value: string): string | readonly string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return trimmed.replace(/^['"]|['"]$/g, '');
}

export function parseMarkdown(path: string, content: string): ParsedDocument {
  const lines = content.split(/\r?\n/);
  const frontmatter: Record<string, string | readonly string[]> = {};
  let cursor = 0;
  if (lines[0]?.trim() === '---') {
    cursor = 1;
    while (cursor < lines.length && lines[cursor].trim() !== '---') {
      const separator = lines[cursor].indexOf(':');
      if (separator > 0) {
        frontmatter[lines[cursor].slice(0, separator).trim()] = parseScalar(lines[cursor].slice(separator + 1));
      }
      cursor += 1;
    }
    if (lines[cursor]?.trim() === '---') cursor += 1;
  }

  const headings: string[] = [];
  const links: string[] = [];
  const codeFences: Array<{ language: string; content: string; closed: boolean }> = [];
  let fence: { marker: string; language: string; lines: string[] } | null = null;

  for (let index = cursor; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (fence) {
      if (trimmed.startsWith(fence.marker)) {
        codeFences.push({ language: fence.language, content: fence.lines.join('\n'), closed: true });
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const marker = trimmed.slice(0, 3);
      fence = { marker, language: trimmed.slice(3).trim(), lines: [] };
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) headings.push(trimmed.replace(/^#{1,6}\s+/, '').trim());
    let offset = 0;
    while (offset < line.length) {
      const open = line.indexOf('](', offset);
      if (open < 0) break;
      const close = line.indexOf(')', open + 2);
      if (close < 0) break;
      links.push(line.slice(open + 2, close).trim());
      offset = close + 1;
    }
  }
  if (fence) codeFences.push({ language: fence.language, content: fence.lines.join('\n'), closed: false });
  return { path, content, frontmatter, headings, links, codeFences };
}

function scalar(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

export function classifyDocument(path: string, repository: DocumentationRepositoryConfig): DocumentationKind {
  const lower = path.toLowerCase();
  if (lower.includes('constitution')) return 'constitution';
  if (/(^|\/)adr[-/]/.test(lower) || /(^|\/)adr-\d+/.test(lower)) return 'adr';
  if (lower.includes('governance')) return 'governance';
  if (repository.authority === 'architecture' || lower.includes('blueprint')) return 'blueprint';
  if (lower.includes('standard')) return 'standard';
  if (lower.includes('spec') || lower.includes('/csp-')) return 'specification';
  if (/(^|\/)readme\.md$/.test(lower)) return 'readme';
  if (lower.includes('architecture')) return 'architecture';
  if (lower.includes('api')) return 'api';
  if (lower.includes('test')) return 'testing';
  if (lower.includes('operation') || lower.includes('runbook')) return 'operations';
  if (lower.includes('migration')) return 'migration';
  if (lower.includes('troubleshoot')) return 'troubleshooting';
  if (lower.includes('tutorial')) return 'tutorial';
  if (lower.includes('guide')) return 'guide';
  if (lower.includes('changelog')) return 'changelog';
  if (lower.includes('generated') || lower.includes('report')) return 'generated-report';
  return 'reference';
}

export function resolveAuthority(
  kind: DocumentationKind,
  repository: DocumentationRepositoryConfig,
): DocumentationAuthority {
  if (kind === 'constitution') return 'constitutional';
  if (kind === 'governance') return 'governance';
  if (kind === 'adr' || kind === 'blueprint' || kind === 'architecture') return 'architecture';
  if (kind === 'standard') return 'standard';
  if (kind === 'specification') return 'specification';
  if (kind === 'readme' || kind === 'testing' || kind === 'operations' || kind === 'migration') {
    return 'implementation';
  }
  if (kind === 'guide' || kind === 'tutorial' || kind === 'troubleshooting') return 'guide';
  if (kind === 'generated-report') return 'generated';
  return repository.authority === 'architecture' ? 'architecture' : 'reference';
}

function extractImplementationRefs(parsed: ParsedDocument): DocumentationImplementationRef[] {
  const refs: DocumentationImplementationRef[] = [];
  const declared = parsed.frontmatter['implementation-ref'];
  const frontmatterRefs = typeof declared === 'string' ? [declared] : (declared ?? []);
  const repository = scalar(parsed.frontmatter['implementation-repository']);
  for (const frontmatterRef of frontmatterRefs) refs.push({ path: frontmatterRef, repository });
  for (const fence of parsed.codeFences) {
    for (const line of fence.content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^(packages|apps|docs|scripts)\//.test(trimmed)) refs.push({ path: trimmed.replace(/[:#].*$/, '') });
    }
  }
  return refs;
}

export function createDocumentEntity(
  repository: DocumentationRepositoryConfig,
  relativePath: string,
  content: string,
): DocumentationEntity {
  const parsed = parseMarkdown(relativePath, content);
  const kind = classifyDocument(relativePath, repository);
  const authority = resolveAuthority(kind, repository);
  const rawStatus = scalar(parsed.frontmatter.status);
  const statuses: readonly DocumentationStatus[] = [
    'current',
    'stale',
    'missing',
    'invalid',
    'conflicting',
    'unverified',
    'proposed',
    'deprecated',
    'superseded',
  ];
  let status: DocumentationStatus = statuses.includes(rawStatus as DocumentationStatus)
    ? (rawStatus as DocumentationStatus)
    : 'unverified';
  const nextReview = scalar(parsed.frontmatter['next-review']);
  if (
    status === 'current' &&
    nextReview &&
    Number.isFinite(Date.parse(nextReview)) &&
    Date.parse(nextReview) < Date.now()
  ) {
    status = 'stale';
  }
  const related = parsed.links.filter((link) => !link.startsWith('http') && !link.startsWith('#'));
  const relatedAdrs = related.filter((link) => /adr[-/]/i.test(link));
  return {
    id: `document://${repository.id}/${relativePath}`,
    repositoryId: repository.id,
    repositoryPath: repository.path,
    path: relativePath,
    kind,
    authority,
    status,
    title: scalar(parsed.frontmatter.title) ?? parsed.headings[0],
    version: scalar(parsed.frontmatter.version),
    owner: scalar(parsed.frontmatter.owner) ?? scalar(parsed.frontmatter.author),
    lastReviewedAt: scalar(parsed.frontmatter['last-reviewed']),
    nextReviewAt: scalar(parsed.frontmatter['next-review']),
    implementationRefs: extractImplementationRefs(parsed),
    relatedEntityIds: related,
    relatedAdrIds: relatedAdrs,
    checksum: createHash('sha256').update(content).digest('hex'),
    parsed,
  };
}
