/**
 * Interactive assistant response blocks — pure parser (no DOM, no network).
 *
 * Derives navigable structure from free-form assistant markdown WITHOUT
 * inventing provenance:
 * - fixes: `Fix X — title` lines, with file refs + route mentions extracted
 *   from the title text only (never guessed from elsewhere)
 * - validations: bullet lines under a Validation heading, split into
 *   command + result on the first dash separator
 * - filesChanged: a `Files changed:` line, split on commas
 * - verifications: bullet lines under a Verification heading
 * - suggestions: bullets under a Next/Recommendation/Suggestion heading,
 *   plus trailing `?` questions (capped)
 *
 * Conservative by design: anything unrecognized yields empty arrays and the
 * caller renders nothing extra (the markdown itself always remains).
 */

export interface FixBlock {
  readonly key: string;
  readonly title: string;
  /** File-like tokens found in the title (`path`, `path:lines`). */
  readonly fileRefs: readonly string[];
  /** Route-like tokens found in the title (`/activity`). */
  readonly routeRefs: readonly string[];
}

export interface ValidationBlock {
  readonly command: string;
  readonly result: string;
}

export interface ParsedResponseBlocks {
  readonly fixes: readonly FixBlock[];
  readonly validations: readonly ValidationBlock[];
  readonly filesChanged: readonly string[];
  readonly verifications: readonly string[];
  readonly suggestions: readonly string[];
}

const FIX_LINE_RE = /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*fix\s+([A-Za-z0-9]+)\s*[—–:\-]\s*(.+?)(?:\*\*)?\s*$/i;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/;
const HEADING_RE = /^\s*(?:#{1,4}\s*)?(?:\*\*)?(.+?)(?:\*\*)?\s*:?\s*$/;
const FILE_TOKEN_RE = /(?:`([^`]+)`)|((?:apps|packages|os|scripts|docs|e2e)\/[^\s,;)]+)/g;
const ROUTE_TOKEN_RE = /(^|\s)(\/[a-z][\w\-]*(?:\/[\w\-.]+)*)/g;
const FILES_CHANGED_RE = /^\s*(?:\*\*)?\s*files?\s+changed\s*:\s*(.+?)(?:\*\*)?\s*$/im;

function stripMarkdownInline(text: string): string {
  return text.replace(/(`+)(.+?)\1/g, '$2').replace(/\*\*(.+?)\*\*/g, '$1').trim();
}

function extractFileRefs(text: string): string[] {
  const refs: string[] = [];
  FILE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILE_TOKEN_RE.exec(text)) !== null) {
    const token = (match[1] ?? match[2] ?? '').trim().replace(/[:.,;]+$/, '');
    if (token.length > 0 && !refs.includes(token)) refs.push(token);
  }
  return refs;
}

function extractRouteRefs(text: string): string[] {
  const refs: string[] = [];
  ROUTE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROUTE_TOKEN_RE.exec(text)) !== null) {
    const token = match[2].replace(/[.,;:!?]+$/, '');
    if (token.length > 1 && !refs.includes(token)) refs.push(token);
  }
  return refs;
}

function isFileLike(token: string): boolean {
  const clean = token.replace(/:\d+(-\d+)?$/, '');
  return clean.includes('/') && (/\.[A-Za-z0-9]{1,5}$/.test(clean) || /^(apps|packages|os|scripts|docs)\//.test(clean));
}

function collectBullets(lines: string[], from: number): { items: string[]; next: number } {
  const items: string[] = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      // Blank line ends the section unless bullets resume (nested lists).
      let j = i + 1;
      while (j < lines.length && lines[j].trim().length === 0) j += 1;
      if (j >= lines.length || !BULLET_RE.test(lines[j])) {
        i = j;
        break;
      }
      i = j;
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (!bullet) break;
    const heading = HEADING_RE.exec(line);
    if (heading && /^(fix|validation|verification|next|recommend|suggest|files?\s+changed)\b/i.test(heading[1])) break;
    items.push(stripMarkdownInline(bullet[1]));
    i += 1;
  }
  return { items, next: i };
}

function headingKind(line: string): 'validation' | 'verification' | 'suggestions' | 'other' {
  const heading = HEADING_RE.exec(line);
  if (!heading) return 'other';
  const text = heading[1].toLowerCase();
  if (text.startsWith('fix') || text.startsWith('files changed')) return 'other';
  if (text.includes('validat')) return 'validation';
  if (text.includes('verif')) return 'verification';
  if (
    text.includes('next') ||
    text.includes('recommend') ||
    text.includes('suggest') ||
    text.includes('follow') ||
    text.startsWith('want me')
  ) {
    return 'suggestions';
  }
  return 'other';
}

function splitValidation(item: string): ValidationBlock {
  const sep = item.search(/\s+[—–]\s+|\s+-\s+:\s*/);
  if (sep === -1) return { command: item, result: '' };
  return { command: item.slice(0, sep).trim(), result: item.slice(sep).replace(/^\s*[—–]\s*|^\s*-\s*/, '').trim() };
}

/**
 * Parse interactive blocks from assistant markdown. Never throws on odd
 * input — worst case returns all-empty arrays.
 */
export function parseResponseBlocks(content: string): ParsedResponseBlocks {
  const fixes: FixBlock[] = [];
  const validations: ValidationBlock[] = [];
  const filesChanged: string[] = [];
  const verifications: string[] = [];
  const suggestions: string[] = [];

  if (!content || content.trim().length === 0) {
    return { fixes, validations, filesChanged, verifications, suggestions };
  }

  const lines = content.split('\n');

  const filesMatch = FILES_CHANGED_RE.exec(content);
  if (filesMatch) {
    for (const part of filesMatch[1].split(/[,;]/)) {
      const token = part
        .replace(/^[`'"\s]+|[`'"\s]+$/g, '')
        .replace(/\band\b\s*/i, '')
        .trim()
        .replace(/[.]+$/, '');
      if (token.length > 0 && (isFileLike(token) || /^[A-Za-z0-9_.@-]+$/.test(token))) {
        if (!filesChanged.includes(token)) filesChanged.push(token);
      }
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fix = FIX_LINE_RE.exec(line);
    if (fix) {
      const title = stripMarkdownInline(fix[2]);
      fixes.push({ key: fix[1].toUpperCase(), title, fileRefs: extractFileRefs(line), routeRefs: extractRouteRefs(line) });
      i += 1;
      continue;
    }
    const kind = headingKind(line);
    if (kind === 'validation' || kind === 'verification' || kind === 'suggestions') {
      const { items, next } = collectBullets(lines, i + 1);
      i = next;
      if (kind === 'validation') {
        for (const item of items) validations.push(splitValidation(item));
      } else if (kind === 'verification') {
        verifications.push(...items);
      } else {
        suggestions.push(...items);
      }
      continue;
    }
    i += 1;
  }

  // Trailing questions double as follow-up chips (capped, de-duplicated).
  if (suggestions.length < 3) {
    for (const line of lines) {
      if (suggestions.length >= 3) break;
      const trimmed = stripMarkdownInline(line);
      if (trimmed.length > 12 && trimmed.length < 220 && trimmed.endsWith('?') && !BULLET_RE.test(line)) {
        if (!suggestions.includes(trimmed)) suggestions.push(trimmed);
      }
    }
  }

  return { fixes, validations, filesChanged, verifications, suggestions };
}

/** True when at least one interactive block was parsed. */
export function hasResponseBlocks(blocks: ParsedResponseBlocks): boolean {
  return (
    blocks.fixes.length > 0 ||
    blocks.validations.length > 0 ||
    blocks.filesChanged.length > 0 ||
    blocks.verifications.length > 0 ||
    blocks.suggestions.length > 0
  );
}
