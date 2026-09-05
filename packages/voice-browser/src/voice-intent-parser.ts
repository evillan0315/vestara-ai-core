/**
 * @vestara/voice-browser — Voice Intent Parser
 *
 * Parses transcribed voice commands into structured browser actions.
 * Uses pattern matching with fallback heuristics for natural language
 * understanding without requiring an LLM.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Voice-Driven Navigation
 */

import type { BrowserAction, VoiceIntent, VoiceIntentType } from './types.js';

interface IntentPattern {
  type: VoiceIntentType;
  patterns: RegExp[];
  extract: (match: RegExpMatchArray, text: string) => Record<string, string | number | boolean>;
  toAction: (params: Record<string, string | number | boolean>) => BrowserAction;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ── Navigation ──
  {
    type: 'navigate_url',
    patterns: [
      /(?:go to|open|navigate to|visit|load)\s+(https?:\/\/\S+)/i,
      /(?:go to|open|navigate to|visit|load)\s+(www\.\S+)/i,
      /(?:go to|open|navigate to|visit|load)\s+(\S+\.(com|org|net|io|dev|edu|gov)\S*)/i,
    ],
    extract: (m) => ({ url: m[1].startsWith('http') ? m[1] : `https://${m[1]}` }),
    toAction: (p) => ({ type: 'navigate', value: p.url as string }),
  },

  // ── Typing (before search so "type X" doesn't match "search X") ──
  {
    type: 'type_text',
    patterns: [/(?:type|enter|input|write)\s+(?:in\s+)?(?:the\s+)?(.+)/i, /(?:fill in|fill out)\s+(?:the\s+)?(.+)/i],
    extract: (m) => ({ text: m[1].trim().replace(/^["']|["']$/g, '') }),
    toAction: (p) => ({
      type: 'type',
      value: p.text as string,
      target: 'focused',
    }),
  },

  // ── Search ──
  {
    type: 'navigate_search',
    patterns: [
      /(?:search for|google|look up|find|search)\s+(.+)/i,
      /(?:what is|what's|who is|who's|how (?:do|does|to))\s+(.+)/i,
    ],
    extract: (m) => ({ query: m[1].trim() }),
    toAction: (p) => ({
      type: 'navigate',
      value: `https://www.google.com/search?q=${encodeURIComponent(p.query as string)}`,
    }),
  },

  // ── Click ──
  {
    type: 'click_element',
    patterns: [/(?:click|tap|press)\s+(?:on\s+)?(?:the\s+)?(.+)/i, /(?:select|choose)\s+(?:the\s+)?(.+)/i],
    extract: (m) => ({ element: m[1].trim() }),
    toAction: (p) => ({
      type: 'click',
      selector: p.element as string,
      target: p.element as string,
    }),
  },

  // ── Scroll ──
  {
    type: 'scroll_page',
    patterns: [
      /scroll\s+(up|down|left|right)(?:\s+(\d+)\s*(?:percent|%|px|pixels?))?/i,
      /(?:page\s+)?(up|down)(?:\s+(\d+)\s*(?:percent|%|px|pixels?))?/i,
    ],
    extract: (m) => ({
      direction: m[1].toLowerCase(),
      amount: m[2] ? Number.parseInt(m[2], 10) : 50,
    }),
    toAction: (p) => ({
      type: 'scroll',
      scrollDirection: p.direction as 'up' | 'down' | 'left' | 'right',
      scrollAmount: (p.amount as number) ?? 50,
    }),
  },

  // ── Navigation controls ──
  {
    type: 'go_back',
    patterns: [/(?:go\s+)?back(?:\s+one)?/i, /previous\s+page/i],
    extract: () => ({}),
    toAction: () => ({ type: 'go_back' }),
  },
  {
    type: 'go_forward',
    patterns: [/(?:go\s+)?forward/i, /next\s+page/i],
    extract: () => ({}),
    toAction: () => ({ type: 'go_forward' }),
  },
  {
    type: 'reload_page',
    patterns: [/(?:reload|refresh)(?:\s+page)?/i],
    extract: () => ({}),
    toAction: () => ({ type: 'reload' }),
  },

  // ── Screenshot ──
  {
    type: 'take_screenshot',
    patterns: [/(?:take\s+)?screenshot/i, /capture\s+(?:the\s+)?(?:screen|page)/i],
    extract: () => ({}),
    toAction: () => ({ type: 'screenshot' }),
  },

  // ── Extract text ──
  {
    type: 'extract_page_text',
    patterns: [
      /(?:extract|get|read)\s+(?:the\s+)?(?:page\s+)?(?:text|content|information)/i,
      /what(?:'s| is)\s+(?:on\s+)?(?:the\s+)?page/i,
    ],
    extract: () => ({}),
    toAction: () => ({ type: 'extract_text' }),
  },

  // ── Tab management ──
  {
    type: 'close_tab',
    patterns: [/(?:close|shut)\s+(?:this\s+)?tab/i],
    extract: () => ({}),
    toAction: () => ({ type: 'close_tab' }),
  },
  {
    type: 'new_tab',
    patterns: [/(?:open|new)\s+(?:a\s+)?tab/i],
    extract: () => ({}),
    toAction: () => ({ type: 'new_tab' }),
  },
  {
    type: 'switch_tab',
    patterns: [/(?:switch|go)\s+to\s+(?:tab\s+)?(\d+|next|previous|last)/i],
    extract: (m) => ({ target: m[1].toLowerCase() }),
    toAction: (p) => ({
      type: 'switch_tab',
      tabIndex: typeof p.target === 'string' && !Number.isNaN(Number(p.target)) ? Number(p.target) - 1 : -1,
    }),
  },
];

/**
 * Parses a transcribed voice command into a structured VoiceIntent.
 */
export function parseVoiceIntent(text: string): VoiceIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      type: 'unknown',
      confidence: 0,
      rawText: text,
      params: {},
    };
  }

  for (const intentPattern of INTENT_PATTERNS) {
    for (const pattern of intentPattern.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const params = intentPattern.extract(match, trimmed);
        return {
          type: intentPattern.type,
          confidence: 0.85,
          rawText: text,
          params,
        };
      }
    }
  }

  // Fallback: if it looks like a URL, navigate to it
  if (/^https?:\/\//.test(trimmed) || /^[\w-]+\.\w{2,}/.test(trimmed)) {
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return {
      type: 'navigate_url',
      confidence: 0.6,
      rawText: text,
      params: { url },
    };
  }

  // Fallback: treat as a search query
  return {
    type: 'navigate_search',
    confidence: 0.4,
    rawText: text,
    params: { query: trimmed },
  };
}

/**
 * Converts a VoiceIntent into a BrowserAction.
 */
export function intentToAction(intent: VoiceIntent): BrowserAction {
  for (const intentPattern of INTENT_PATTERNS) {
    if (intentPattern.type === intent.type) {
      return intentPattern.toAction(intent.params);
    }
  }

  // Fallback: search
  return {
    type: 'navigate',
    value: `https://www.google.com/search?q=${encodeURIComponent((intent.params.query as string) ?? intent.rawText)}`,
  };
}
