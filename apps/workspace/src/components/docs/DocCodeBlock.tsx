/**
 * Rich code block for the Documentation viewer.
 *
 * Supports syntax highlighting (highlight.js), a filename label, copy
 * button, optional line numbers, `{1,3-5}` line highlighting, and
 * `diff`-style added/removed line markers. Mermaid fenced blocks are
 * delegated to the <Mermaid> renderer.
 */

import hljs from 'highlight.js/lib/common';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Mermaid } from './Mermaid';

interface CodeMeta {
  filename?: string;
  highlight?: Set<number>;
}

export function parseCodeMeta(meta: string | undefined): CodeMeta {
  const out: CodeMeta = {};
  if (!meta) return out;

  const title = meta.match(/title=["']?([^"'\]\s]+)/i);
  if (title) out.filename = title[1].replace(/['"]$/, '');

  const hl = meta.match(/\{([0-9,\-\s]+)\}/);
  if (hl) {
    const lines = new Set<number>();
    for (const part of hl[1].split(',')) {
      const range = part.trim().match(/^(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        for (let i = start; i <= end; i += 1) lines.add(i);
      } else if (/^\d+$/.test(part.trim())) {
        lines.add(Number(part.trim()));
      }
    }
    out.highlight = lines;
  }

  return out;
}

export function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children ?? '');
  }
  return '';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface DocCodeBlockProps {
  className?: string;
  children?: ReactNode;
  inline?: boolean;
  node?: { data?: Record<string, unknown> };
  showLineNumbers?: boolean;
}

export function DocCodeBlock({ className, children, inline, node, showLineNumbers }: DocCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children).replace(/\n$/, '');
  const lang = (className?.replace('language-', '') || '').trim().toLowerCase();
  const isInline = inline || (!className?.startsWith('language-') && !text.includes('\n'));

  if (isInline) {
    return <code className="doc-inline-code">{text}</code>;
  }

  // Mermaid diagrams are rendered as SVG, not highlighted code.
  if (lang === 'mermaid') {
    return <Mermaid code={text} />;
  }

  const meta = parseCodeMeta(typeof node?.data?.meta === 'string' ? node.data.meta : undefined);
  const isDiff = lang === 'diff' || lang.startsWith('diff-');

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  // Per-line highlighting keeps line numbers / diff markers robust even for
  // content that the whole-block highlighter would wrap across lines.
  const highlighted = hljs.getLanguage(lang) && !isDiff;
  const rawLines = text.split('\n');
  const htmlLines = highlighted
    ? rawLines.map((line) => hljs.highlight(line, { language: lang }).value)
    : rawLines.map(escapeHtml);

  const label = meta.filename || (lang && lang !== 'text' ? lang : '');

  const body = (
    <div className="doc-codeblock-body">
      <div className={label ? 'doc-codeblock-pre' : 'doc-codeblock-pre doc-codeblock-pre-plain'}>
        {rawLines.map((raw, i) => {
          const lineNo = i + 1;
          const isHl = meta.highlight?.has(lineNo);
          let cls = isHl ? 'doc-line-hl' : '';
          let showSign = false;
          if (isDiff) {
            if (raw.startsWith('+')) {
              cls = `${cls} doc-diff-add`.trim();
              showSign = true;
            } else if (raw.startsWith('-')) {
              cls = `${cls} doc-diff-del`.trim();
              showSign = true;
            } else if (raw.startsWith('@@')) {
              cls = `${cls} doc-diff-hunk`.trim();
              showSign = true;
            }
          }
          return (
            <div key={lineNo} className={`doc-code-line ${cls}`}>
              {showLineNumbers && (
                <span className="doc-code-lineno" aria-hidden="true">
                  {lineNo}
                </span>
              )}
              {showSign && <span className="doc-diff-sign">{raw[0]}</span>}
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js output is escaped for unknown languages */}
              <span className="doc-code-text" dangerouslySetInnerHTML={{ __html: htmlLines[i] }} />
            </div>
          );
        })}
      </div>
      {!label && (
        <button type="button" className="doc-codeblock-copy-float" onClick={handleCopy} aria-label="Copy code">
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  );

  return (
    <div className="doc-codeblock">
      {label && (
        <div className="doc-codeblock-bar">
          <span className="doc-codeblock-filename">
            {meta.filename && <span className="doc-codeblock-arrow">▸</span>}
            {meta.filename || label}
          </span>
          <button type="button" className="doc-codeblock-copy" onClick={handleCopy} aria-label="Copy code">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {body}
    </div>
  );
}
