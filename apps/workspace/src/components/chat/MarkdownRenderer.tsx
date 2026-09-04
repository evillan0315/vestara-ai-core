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

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const components = {
    code: CodeBlock as any,
    table: Table as any,
    a: SafeLink as any,
  };

  return (
    <div className="markdown">
      {/* No rehype-raw / allowDangerousHtml: raw model HTML is escaped as
          text and can never become a DOM injection path. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { aliases: HIGHLIGHT_ALIASES }]]}
        components={components as any}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
