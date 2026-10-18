/**
 * Local-first composer spellcheck (no network, no telemetry).
 *
 * Runs entirely in the browser over the current draft. Covers:
 * - common typos (curated map, case-preserving)
 * - repeated words ("the the")
 * - double spacing inside a line
 *
 * Deliberately narrow: this is a typing aid, not a grammar engine. It never
 * mutates the draft on its own — every correction requires an explicit user
 * Apply. Send always transmits the current draft verbatim.
 */

export type SpellingIssueKind = 'typo' | 'repeat' | 'spacing';

export interface SpellingIssue {
  /** Stable within one `findSpellingIssues` pass: `${start}:${end}:${word}`. */
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly word: string;
  readonly suggestion: string;
  readonly kind: SpellingIssueKind;
}

/**
 * Curated common-typo map (lowercase key → correction). Includes Vestara
 * workspace vocabulary plus everyday typos observed in real drafts.
 */
export const COMMON_TYPOS: Readonly<Record<string, string>> = {
  teh: 'the',
  hte: 'the',
  adn: 'and',
  nad: 'and',
  gloabl: 'global',
  vestaraa: 'vestara',
  veestara: 'vestara',
  avaiable: 'available',
  availabe: 'available',
  recieve: 'receive',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  neccessary: 'necessary',
  maintainance: 'maintenance',
  notifcation: 'notification',
  notifcations: 'notifications',
  conversaton: 'conversation',
  converstation: 'conversation',
  assistent: 'assistant',
  assitant: 'assistant',
  enviroment: 'environment',
  envrionment: 'environment',
  worksapce: 'workspace',
  workpsace: 'workspace',
  setttings: 'settings',
  setings: 'settings',
  navigaton: 'navigation',
  naviagte: 'navigate',
  reccomendation: 'recommendation',
  recomendation: 'recommendation',
  suggesiton: 'suggestion',
  sugestion: 'suggestion',
  validaton: 'validation',
  verificaton: 'verification',
  evidance: 'evidence',
  interacitve: 'interactive',
  dynamc: 'dynamic',
  futuer: 'future',
  alredy: 'already',
  exsited: 'existed',
  implementaton: 'implementation',
  developement: 'development',
  capabilites: 'capabilities',
  capabilties: 'capabilities',
  featuer: 'feature',
};

function preserveCase(source: string, correction: string): string {
  if (source.length === 0) return correction;
  if (source === source.toUpperCase()) return correction.toUpperCase();
  const first = source[0];
  if (first === first.toUpperCase()) {
    return correction[0].toUpperCase() + correction.slice(1);
  }
  return correction;
}

const WORD_RE = /[A-Za-z][A-Za-z']*/g;

/**
 * Find spelling issues in a draft. Pure — safe to call per keystroke
 * (bounded: single pass over words). Offsets are UTF-16 indices into `text`.
 */
export function findSpellingIssues(text: string): SpellingIssue[] {
  const issues: SpellingIssue[] = [];
  if (!text || text.trim().length === 0) return issues;

  let prevWord: string | null = null;
  let match: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((match = WORD_RE.exec(text)) !== null) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;
    const lower = word.toLowerCase();

    const typo = COMMON_TYPOS[lower];
    if (typo) {
      issues.push({
        id: `${start}:${end}:${word}`,
        start,
        end,
        word,
        suggestion: preserveCase(word, typo),
        kind: 'typo',
      });
    } else if (prevWord !== null && lower === prevWord && word.length > 1) {
      // Repeated word ("the the"). Point at the second occurrence.
      issues.push({
        id: `${start}:${end}:${word}`,
        start,
        end,
        word,
        suggestion: '',
        kind: 'repeat',
      });
    }
    prevWord = lower;
  }

  // Double spacing inside a line (not across newlines/indentation).
  for (let i = 0; i + 1 < text.length; i += 1) {
    if (text[i] === ' ' && text[i + 1] === ' ' && text[i - 1] !== '\n' && text[i + 2] !== '\n') {
      let end = i + 2;
      while (text[end] === ' ') end += 1;
      issues.push({
        id: `${i}:${end}:double-space`,
        start: i,
        end,
        word: text.slice(i, end),
        suggestion: ' ',
        kind: 'spacing',
      });
      i = end - 1;
    }
  }

  issues.sort((a, b) => a.start - b.start);
  return issues;
}

/** Apply one issue's suggestion to the draft. Repeat issues delete the word. */
export function applySuggestion(text: string, issue: SpellingIssue): string {
  return text.slice(0, issue.start) + issue.suggestion + text.slice(issue.end);
}
