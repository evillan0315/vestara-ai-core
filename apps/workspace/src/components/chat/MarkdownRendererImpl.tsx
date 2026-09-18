/**
 * VES-PERF-002 (P1): the actual markdown pipeline.
 *
 * Loaded as a lazy chunk by `MarkdownRenderer` because `react-markdown` +
 * `remark-gfm` + `rehype-highlight` + `highlight.js` were a large share of the
 * main `index` bundle, which every route paid for even without rendering
 * markdown. Keeping the wrapper synchronous-and-memoized preserves existing
 * component contracts, tests, and the no-flash prefetch path.
 */

import { memo, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github-dark.css';
import { CodeBlock, Table } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Zero-bundle language aliases for the lowlight common subset already
 * shipped via rehype-highlight. Every target is a registered grammar;
 * unknown tags (e.g. `foobar`) still render as plain code. Verified:
 * lowlight/common registers typescript, javascript, json, bash, shell,
 * yaml, markdown, sql, css, xml (+ others) — these need no alias.
 */
const HIGHLIGHT_ALIASES = {
  tsx: 'typescript',
  jsx: 'javascript',
  sh: 'bash',
  zsh: 'bash',
  terminal: 'bash',
  html: 'xml',
  htm: 'xml',
  yml: 'yaml',
  md: 'markdown',
} as const;

/**
 * Safe link semantics for model-produced URLs (GA-UI-005).
 *
 * Opening a URL is presentation/navigation, never Assistant tool
 * authorization: external links open in a new tab with
 * `noopener noreferrer` (same convention as DocMarkdown), fragment links
 * stay in place, and every other href (relative paths, repo-relative
 * references) also opens out-of-band so model output can never hijack
 * Workspace routing or trigger privileged execution.
 */
function SafeLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const target = href ?? '';
  if (!target) {
    return <a href={target}>{children}</a>;
  }
  if (target.startsWith('#')) {
    return <a href={target}>{children}</a>;
  }
  return (
    <a
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words [overflow-wrap:anywhere]"
    >
      {children}
    </a>
  );
}

/**
 * VES-PERF-002 (P0): hoisted to module scope so `react-markdown` receives
 * stable plugin + component identities. Previously the `components` object
 * was rebuilt on every render, which re-parsed the entire (often 100 KB+)
 * message body and defeated memoization on the assistant message list.
 */
const REMARK_PLUGINS: any[] = [remarkGfm];
const PLAIN_PLUGINS: any[] = [];
const HIGHLIGHT_PLUGINS: any[] = [[rehypeHighlight, { aliases: HIGHLIGHT_ALIASES }]];
const MARKDOWN_COMPONENTS = {
  code: CodeBlock as any,
  table: Table as any,
  a: SafeLink as any,
};

/**
 * VES-PERF-002 (P0): defer `rehype-highlight` to the first idle frame so the
 * initial paint of a long conversation is not blocked by syntax tokenization.
 * Environments without `requestIdleCallback` (jsdom under vitest) highlight
 * synchronously, keeping the GA-UI-005 `hljs-*` DOM contract deterministic.
 */
const CAN_DEFER_HIGHLIGHT = typeof requestIdleCallback === 'function';

function useDeferredHighlight(): boolean {
  const [ready, setReady] = useState(!CAN_DEFER_HIGHLIGHT);
  useEffect(() => {
    if (!CAN_DEFER_HIGHLIGHT || ready) return;
    const id = requestIdleCallback(() => setReady(true), { timeout: 400 });
    return () => cancelIdleCallback(id);
  }, [ready]);
  return ready;
}

export default memo(function MarkdownRendererImpl({ content }: MarkdownRendererProps) {
  const highlight = useDeferredHighlight();

  return (
    <div className="markdown">
      {/* No rehype-raw / allowDangerousHtml: raw model HTML is escaped as
          text and can never become a DOM injection path. */}
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={highlight ? HIGHLIGHT_PLUGINS : PLAIN_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
