/**
 * @vestara/voice-browser — Instruction-to-Task Planner
 *
 * Converts a natural-language browser instruction (typed or spoken) into a
 * structured, traceable BrowserTask: a sequence of steps the Browser Task
 * Runner (LB-011) can execute against a governed session.
 *
 * Supported patterns (extensible):
 *   - "go to / open / visit <url|domain>"          → navigate
 *   - "log in to <target> as <user> with <pass>"   → navigate + type + submit
 *   - "search for <query> on <target>"             → navigate + type(submit)
 *   - "shop / buy <item> on <target>"              → navigate + search + extract
 *   - "click <selector|text>"                      → click
 *   - "type <text> into <selector>"                → type
 *   - "scroll down/up", "go back", "go forward", "refresh", "screenshot",
 *     "extract / read the page"                    → single-step actions
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

function normalizeTarget(raw: string): string {
  const trimmed = raw.trim().replace(/[.,;:!?]+$/, '');
  if (!trimmed) return '';
  if (isHttpUrl(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  if (looksLikeDomain(trimmed) || /^[a-z0-9-]+$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** Find the first navigation target (URL or bare domain) referenced by the text. */
export function extractTarget(text: string): string | undefined {
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) return normalizeTarget(urlMatch[0]);
  for (const match of text.matchAll(
    /(?:on|at|in|to|visit|open|go to)\s+((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?)/gi,
  )) {
    const candidate = normalizeTarget(match[1]);
    if (candidate && !/^(on|at|in|to|visit|open|go)$/i.test(candidate)) return candidate;
  }
  const bare = text.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?/i);
  return bare ? normalizeTarget(bare[0]) : undefined;
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

// ─── Planner ────────────────────────────────────────────────

const counter = { n: 0 };

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
 * Plan a browser task from a natural-language instruction.
 *
 * Throws a descriptive error (listing supported patterns) when the text does
 * not match any pattern.
 */
export function planBrowserTask(text: string, options: PlanBrowserTaskOptions): InstructionPlan {
  const raw = text.trim();
  if (!raw) throw new Error('Instruction must not be empty');
  const lower = raw.toLowerCase();
  const warnings: string[] = [];
  const task = newTask(options.sessionId, options.ownerId, options.objective ?? raw);
  const steps: BrowserStep[] = [];

  const target = extractTarget(raw);
  const startTarget = target ?? options.baseUrl;

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
    return { task: finishTask(task, steps), warnings };
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
    return { task: finishTask(task, steps), warnings };
  }

  const bareSearch = lower.match(/^(?:search|look up|google|find)\s+(?:for\s+)?(.+)$/);
  if (bareSearch) {
    const query = bareSearch[1].trim().replace(/^"|"$/g, '');
    pushStep(task, steps, `Type search query "${query}"`, 'type', {
      selector: SEARCH_SELECTORS,
      text: query,
      submit: true,
    });
    return { task: finishTask(task, steps), warnings };
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
    return { task: finishTask(task, steps), warnings };
  }

  // ─── History / refresh (before plain navigation, as "go back" is not a target) ──
  if (/^(go back|back)\b/.test(lower)) {
    pushStep(task, steps, 'Go back in history', 'back', {});
    return { task: finishTask(task, steps), warnings };
  }

  if (/^(go forward|forward)\b/.test(lower)) {
    pushStep(task, steps, 'Go forward in history', 'forward', {});
    return { task: finishTask(task, steps), warnings };
  }

  // ─── Plain navigation ────────────────────────────────────
  const navMatch = lower.match(/^(?:go|open|navigate|visit|take me)\s+(?:to\s+)?(.+)$/);
  if (navMatch) {
    const navTarget = extractTarget(navMatch[1]) ?? startTarget;
    if (!navTarget) throw new Error(`Could not determine a navigation target from: "${raw}"`);
    pushNavigate(navTarget);
    return { task: finishTask(task, steps), warnings };
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
    return { task: finishTask(task, steps), warnings };
  }

  const typeMatch = raw.match(/^type\s+(.+?)\s+(?:into|in)\s+(.+?)\s*$/i);
  if (typeMatch) {
    const text = typeMatch[1].trim().replace(/^"|"$/g, '');
    pushStep(task, steps, `Type "${text}"`, 'type', {
      selector: typeMatch[2].trim(),
      text,
    });
    return { task: finishTask(task, steps), warnings };
  }

  const scrollMatch = lower.match(/^scroll\s+(down|up)(?:\s+(\d+))?/);
  if (scrollMatch) {
    const direction = scrollMatch[1] as 'down' | 'up';
    const amount = scrollMatch[2] ? Number(scrollMatch[2]) : undefined;
    pushStep(task, steps, `Scroll ${direction}`, 'scroll', {
      direction,
      ...(amount ? { amount } : {}),
    });
    return { task: finishTask(task, steps), warnings };
  }

  if (/(reload|refresh)(\s|$)/.test(lower)) {
    pushStep(task, steps, 'Reload the page', 'reload', {});
    return { task: finishTask(task, steps), warnings };
  }

  if (/(take a screenshot|screenshot|capture the (?:page|screen))/.test(lower)) {
    pushStep(task, steps, 'Capture a screenshot', 'screenshot', {});
    return { task: finishTask(task, steps), warnings };
  }

  if (/(extract|read|summarize)(\s+(?:the\s+)?(?:page|text|content))?/.test(lower)) {
    pushStep(task, steps, 'Extract the page text', 'extract', {});
    return { task: finishTask(task, steps), warnings };
  }

  // ─── Fallback ────────────────────────────────────────────
  if (startTarget) {
    pushNavigate(startTarget);
    return { task: finishTask(task, steps), warnings };
  }

  throw new Error(
    `Could not understand the instruction: "${raw}". ` +
      'Supported patterns: "go to <url>", "log in to <site> as <user> with <pass>", ' +
      '"search for <query> on <site>", "shop for <item> on <site>", ' +
      '"click <element>", "type <text> into <field>", "scroll down", ' +
      '"go back", "go forward", "refresh", "screenshot", "extract the page".',
  );
}
