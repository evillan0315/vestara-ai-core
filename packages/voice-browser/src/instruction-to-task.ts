/**
 * @vestara/voice-browser — Instruction-to-Task Planner
 *
 * Converts a natural-language browser instruction (typed or spoken) into a
 * structured, traceable BrowserTask: a sequence of steps the Browser Task
 * Runner (LB-011) can execute against a governed session.
 *
 * Supported patterns (extensible):
 *   - "go to / open / visit <url|domain>"          → navigate
 *   - "go to google"                               → navigate https://google.com (bare-name expansion)
 *   - "log in to <target> as <user> with <pass>"   → navigate + type + submit
 *   - "search for <query> on <target>"             → navigate + type(submit)
 *   - "shop / buy <item> on <target>"              → navigate + search + extract
 *   - "click <selector|text>"                      → click
 *   - "type <text> into <field>"                   → type (field names map to selector heuristics)
 *   - "wait for the page to load"                  → wait
 *   - "when you see <field> type <text>"           → wait? + type
 *   - "scroll down/up", "go back", "go forward", "refresh", "screenshot",
 *     "extract / read the page"                    → single-step actions
 *
 * Multi-step instructions joined by "then", "and" or punctuation are split
 * into clauses and planned independently; the merge is all-or-nothing so a
 * partially-understood instruction never produces a partial plan.
 *
 * Steps use CSS/text selectors (a superset of what a human would type); the
 * task runner waits for elements with playwright defaults. When an instruction
 * needs credentials that are not provided, the plan stops at the sign-in page
 * so the human can complete the form (task enters 'waiting').
 */

import {
  addBrowserStep,
  type BrowserStep,
  type BrowserStepAction,
  type BrowserTask,
  createBrowserTask,
} from '@vestara/tools-browser';

// ─── Selector heuristics ────────────────────────────────────

const SEARCH_SELECTORS =
  'input[type="search"], input[role="searchbox"], input[name="q"], input[name="search"], input[name="query"], textarea[type="search"]';
const USERNAME_SELECTORS =
  'input[type="email"], input[name="username"], input[name="email"], input[name="login"], input[autocomplete="username"]';
const PASSWORD_SELECTOR = 'input[type="password"]';
const SUBMIT_SELECTORS =
  'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")';

export interface PlanBrowserTaskOptions {
  readonly sessionId: string;
  readonly ownerId: string;
  /** When the instruction names no explicit target, navigate here first. */
  readonly baseUrl?: string;
  /** Human-readable objective; defaults to the raw instruction text. */
  readonly objective?: string;
}

export interface InstructionPlan {
  readonly task: BrowserTask;
  /** Non-fatal notes surfaced to the caller (e.g. missing credentials). */
  readonly warnings: readonly string[];
}

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const looksLikeDomain = (value: string): boolean => /(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?/i.test(value);

/** Words that never name a navigation target when used bare. */
const STOPWORDS = new Set([
  'on',
  'at',
  'in',
  'to',
  'visit',
  'open',
  'go',
  'the',
  'a',
  'an',
  'and',
  'then',
  'it',
  'this',
  'that',
  'my',
]);

function normalizeTarget(raw: string): string {
  const trimmed = raw.trim().replace(/[.,;:!?]+$/, '');
  if (!trimmed) return '';
  if (isHttpUrl(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  if (looksLikeDomain(trimmed)) return `https://${trimmed}`;
  if (/^[a-z0-9-]+$/i.test(trimmed)) {
    const token = trimmed.toLowerCase();
    if (token === 'localhost') return 'https://localhost';
    if (!STOPWORDS.has(token)) return `https://${trimmed}.com`;
  }
  return trimmed;
}

/** Find the first navigation target (URL, domain, or bare name) referenced by the text. */
export function extractTarget(text: string): string | undefined {
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) return normalizeTarget(urlMatch[0]);
  // "on <domain>", "to <domain>", "go to <domain>" — dotted domains first.
  for (const match of text.matchAll(
    /(?:on|at|in|to|visit|open|go to)\s+((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?)/gi,
  )) {
    const candidate = normalizeTarget(match[1]);
    if (candidate && !/^(on|at|in|to|visit|open|go)$/i.test(candidate)) return candidate;
  }
  const bare = text.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?/i);
  if (bare) return normalizeTarget(bare[0]);
  // "to <bare-name>" (e.g. "log in to google …").
  for (const match of text.matchAll(/(?:on|at|in|to|visit|open|go to)\s+([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi)) {
    const word = match[1].toLowerCase();
    if (!STOPWORDS.has(word)) return normalizeTarget(match[1]);
  }
  // A lone bare name ("google").
  const token = text.trim().match(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i);
  if (token && !STOPWORDS.has(token[0].toLowerCase())) return normalizeTarget(token[0]);
  return undefined;
}

/** Extract "as <user> with <pass>" / "username <u> password <p>" credential pairs. */
export function extractCredentials(text: string): { readonly username: string; readonly password: string } | undefined {
  const asPair = text.match(/\bas\s+([\w.@+-]+)\s+(?:with|and)\s+(?:password\s+)?([^\s,.;]+)/i);
  if (asPair) return { username: asPair[1], password: asPair[2] };
  const explicitPair = text.match(/(?:username|user|login)\s+([\w.@+-]+)\s+(?:password|pass)\s+([^\s,.;]+)/i);
  if (explicitPair) return { username: explicitPair[1], password: explicitPair[2] };
  const shorthands = text.match(/([\w.@+-]+)\s*[:/]\s*([^\s,.;]+)/);
  if (shorthands && (text.includes('login') || text.includes('log in') || text.includes('sign in'))) {
    return { username: shorthands[1], password: shorthands[2] };
  }
  return undefined;
}

// ─── Compound / clause planning ─────────────────────────────

/** Connectors that separate independent clauses in an instruction. */
const CLAUSE_SEPARATOR = /\s*(?:[.,;]|\bthen\b|\band\s+then\b|\band\b)\s+/i;

/** Navigation verb phrase; the target capture stops at the first connector. */
const NAV_PATTERN =
  /^(?:go|open|navigate|visit|take me)\s+(?:to\s+)?(.+?)(?=(?:\s*[.,;]|\s+(?:\bthen\b|\band\s+then\b|\band\b))\s|$)/i;

const WAIT_PATTERN =
  /^(?:wait|pause|hold on)(?:\s+(?:for|until))?(?:\s+(?:a\s+)?(?:moment|sec(?:ond)?|bit))?(?:\s+the\s+page(?:\s+to\s+load)?)?$/i;

function splitClauses(raw: string): string[] {
  return raw
    .split(CLAUSE_SEPARATOR)
    .map((clause) =>
      clause
        .trim()
        .replace(/^(?:and|then|but)\s+/i, '')
        .trim(),
    )
    .filter((clause) => clause.length > 0);
}

/** Map a human field description to a concrete selector (or keep it as-is). */
function describeSelector(phrase: string): string {
  const p = phrase.trim().toLowerCase();
  if (/(search|query|find)/.test(p)) return SEARCH_SELECTORS;
  if (/(username|user name|e-?mail|login field|\buser\b)/.test(p)) return USERNAME_SELECTORS;
  if (/pass(word)?/.test(p)) return PASSWORD_SELECTOR;
  if (/(submit|sign ?in|log ?in|button)/.test(p)) return SUBMIT_SELECTORS;
  return phrase.trim();
}

// ─── Planner ────────────────────────────────────────────────

function newTask(sessionId: string, ownerId: string, objective: string): BrowserTask {
  return createBrowserTask(sessionId, ownerId, objective);
}

function pushStep(
  task: BrowserTask,
  steps: BrowserStep[],
  description: string,
  action: BrowserStepAction,
  input: Readonly<Record<string, unknown>> = {},
): void {
  steps.push(addBrowserStep(task, description, action, input));
}

/** Snap a task's (readonly) steps array in place, returning the finished task. */
function finishTask(task: BrowserTask, steps: readonly BrowserStep[]): BrowserTask {
  return { ...task, steps };
}

/**
 * Attempt to plan one instruction (a whole sentence or a single clause).
 * Mutates `steps`/`warnings` only on success; returns false when the text
 * cannot be understood so callers can try a broader interpretation.
 */
function tryPlan(
  raw: string,
  options: PlanBrowserTaskOptions,
  task: BrowserTask,
  steps: BrowserStep[],
  warnings: string[],
): boolean {
  const lower = raw.toLowerCase();
  const startTarget = extractTarget(raw) ?? options.baseUrl;

  const pushNavigate = (t: string): void => {
    pushStep(task, steps, `Navigate to ${t}`, 'navigate', { url: t });
  };

  // ─── Login / sign-in ─────────────────────────────────────
  if (/(log ?in|sign ?in|login)/i.test(lower)) {
    if (startTarget) pushNavigate(startTarget);
    const creds = extractCredentials(raw);
    if (creds) {
      pushStep(task, steps, 'Enter username', 'type', {
        selector: USERNAME_SELECTORS,
        text: creds.username,
      });
      pushStep(task, steps, 'Enter password', 'type', {
        selector: PASSWORD_SELECTOR,
        text: creds.password,
      });
      pushStep(task, steps, 'Submit sign-in form', 'click', { selector: SUBMIT_SELECTORS });
    } else {
      warnings.push('No credentials were given, so the plan stops at the sign-in page — complete the form manually.');
      pushStep(task, steps, 'Wait for the sign-in form to settle', 'wait', {});
    }
    return true;
  }

  // ─── Search ──────────────────────────────────────────────
  const searchMatch = lower.match(/^(?:search|look up|google|find)\s+(?:for\s+)?(.+?)\s+(?:on|at|in)\s+(.+)$/);
  if (searchMatch) {
    const query = searchMatch[1].trim().replace(/^"|"$/g, '');
    const searchTarget = extractTarget(searchMatch[2]) ?? startTarget;
    if (searchTarget) pushNavigate(searchTarget);
    pushStep(task, steps, `Type search query "${query}"`, 'type', {
      selector: SEARCH_SELECTORS,
      text: query,
      submit: true,
    });
    return true;
  }

  const bareSearch = lower.match(/^(?:search|look up|google|find)\s+(?:for\s+)?(.+)$/);
  if (bareSearch) {
    const query = bareSearch[1].trim().replace(/^"|"$/g, '');
    pushStep(task, steps, `Type search query "${query}"`, 'type', {
      selector: SEARCH_SELECTORS,
      text: query,
      submit: true,
    });
    return true;
  }

  // ─── Shop / buy / purchase ───────────────────────────────
  const shopMatch = lower.match(/^(?:shop|buy|purchase|browse)(?:\s+for)?\s+(.+?)\s+(?:on|at|in)\s+(.+)$/);
  if (shopMatch) {
    const item = shopMatch[1].trim().replace(/^"|"$/g, '');
    const shopTarget = extractTarget(shopMatch[2]) ?? startTarget;
    if (shopTarget) pushNavigate(shopTarget);
    pushStep(task, steps, `Search the store for "${item}"`, 'type', {
      selector: SEARCH_SELECTORS,
      text: item,
      submit: true,
    });
    pushStep(task, steps, 'Extract the page text of the results', 'extract', {});
    warnings.push('Shopping plans stop at the results page — add to cart / checkout still need human confirmation.');
    return true;
  }

  // ─── History / refresh (before plain navigation, as "go back" is not a target) ──
  if (/^(go back|back)\b/.test(lower)) {
    pushStep(task, steps, 'Go back in history', 'back', {});
    return true;
  }

  if (/^(go forward|forward)\b/.test(lower)) {
    pushStep(task, steps, 'Go forward in history', 'forward', {});
    return true;
  }

  // ─── Wait for the page to load ───────────────────────────
  if (WAIT_PATTERN.test(lower)) {
    pushStep(task, steps, 'Wait for the page to load', 'wait', {});
    return true;
  }

  // ─── Plain navigation ────────────────────────────────────
  const navMatch = lower.match(NAV_PATTERN);
  if (navMatch) {
    // If a connector follows the target, plan the whole sentence as clauses
    // (all-or-nothing) rather than silently dropping the remaining steps.
    const rest = raw.slice(navMatch[0].length).trim();
    if (rest) {
      const stepsBefore = steps.length;
      const warningsBefore = warnings.length;
      const clauses = splitClauses(raw);
      if (clauses.length > 1 && clauses.every((clause) => tryPlan(clause, options, task, steps, warnings))) {
        return true;
      }
      steps.length = stepsBefore;
      warnings.length = warningsBefore;
      return false;
    }
    const navTarget = extractTarget(navMatch[1]) ?? startTarget;
    if (!navTarget) return false;
    pushNavigate(navTarget);
    return true;
  }

  // ─── Single-action commands ──────────────────────────────
  const clickMatch = raw.match(/^click\s+(.+?)\s*$/i);
  if (clickMatch) {
    const what = clickMatch[1]
      .trim()
      .replace(/^"|"$/g, '')
      .replace(/^the\s+/i, '');
    const selector = /^[.#[\]a-z0-9_:-]+$/i.test(what) && !/\s/.test(what) ? what : `text=${what}`;
    pushStep(task, steps, `Click ${what}`, 'click', { selector });
    return true;
  }

  const typeMatch = raw.match(/^type\s+(.+?)\s*(?:into|in)\s+(.+?)\s*$/i);
  if (typeMatch) {
    const text = typeMatch[1].trim().replace(/^"|"$/g, '');
    const selector = describeSelector(typeMatch[2].trim());
    pushStep(task, steps, `Type "${text}"`, 'type', { selector, text });
    return true;
  }

  // "when you see the search box type money" (field first, then the value).
  const fieldTypeMatch = raw.match(
    /^(?:wait\b[\s\S]*?)?\s*(?:and\s+)?(?:when\s+you\s+see\s+)?(?:the\s+)?(.+?(?:box|bar|field|input|username|email|password|button))\s+(?:type|enter|search\s+for)\s+(.+?)\s*$/i,
  );
  if (fieldTypeMatch) {
    const field = describeSelector(fieldTypeMatch[1].trim());
    const value = fieldTypeMatch[2].trim().replace(/^"|"$/g, '');
    const submit = /search\s+for/i.test(fieldTypeMatch[0]);
    if (/\bwait\b/i.test(raw)) pushStep(task, steps, 'Wait for the page to load', 'wait', {});
    pushStep(task, steps, `Type "${value}"`, 'type', { selector: field, text: value, submit });
    return true;
  }

  const scrollMatch = lower.match(/^scroll\s+(down|up)(?:\s+(\d+))?/);
  if (scrollMatch) {
    const direction = scrollMatch[1] as 'down' | 'up';
    const amount = scrollMatch[2] ? Number(scrollMatch[2]) : undefined;
    pushStep(task, steps, `Scroll ${direction}`, 'scroll', {
      direction,
      ...(amount ? { amount } : {}),
    });
    return true;
  }

  if (/(reload|refresh)(\s|$)/.test(lower)) {
    pushStep(task, steps, 'Reload the page', 'reload', {});
    return true;
  }

  if (/(take a screenshot|screenshot|capture the (?:page|screen))/.test(lower)) {
    pushStep(task, steps, 'Capture a screenshot', 'screenshot', {});
    return true;
  }

  if (/(extract|read|summarize)(\s+(?:the\s+)?(?:page|text|content))?/.test(lower)) {
    pushStep(task, steps, 'Extract the page text', 'extract', {});
    return true;
  }

  // ─── Compound fallback (multiple clauses) ────────────────
  const clauses = splitClauses(raw);
  if (clauses.length > 1) {
    const stepsBefore = steps.length;
    const warningsBefore = warnings.length;
    if (clauses.every((clause) => tryPlan(clause, options, task, steps, warnings))) return true;
    steps.length = stepsBefore;
    warnings.length = warningsBefore;
  }

  // ─── Fallback ────────────────────────────────────────────
  if (startTarget) {
    pushNavigate(startTarget);
    return true;
  }

  return false;
}

/**
 * Plan a browser task from a natural-language instruction.
 *
 * Throws a descriptive error (listing supported patterns) when the text does
 * not match any pattern.
 */
export function planBrowserTask(text: string, options: PlanBrowserTaskOptions): InstructionPlan {
  const raw = text.trim();
  if (!raw) throw new Error('Instruction must not be empty');
  const task = newTask(options.sessionId, options.ownerId, options.objective ?? raw);
  const steps: BrowserStep[] = [];
  const warnings: string[] = [];

  if (!tryPlan(raw, options, task, steps, warnings)) {
    throw new Error(
      `Could not understand the instruction: "${raw}". ` +
        'Supported patterns: "go to <url>", "log in to <site> as <user> with <pass>", ' +
        '"search for <query> on <site>", "shop for <item> on <site>", ' +
        '"click <element>", "type <text> into <field>", "wait for the page to load", ' +
        '"scroll down", "go back", "go forward", "refresh", "screenshot", "extract the page". ' +
        'Multi-step instructions can be combined with "then" / "and".',
    );
  }

  return { task: finishTask(task, steps), warnings };
}
