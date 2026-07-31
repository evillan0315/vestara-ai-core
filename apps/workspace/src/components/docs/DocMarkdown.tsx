/**
 * Rich markdown renderer for the Documentation viewer.
 *
 * Built on react-markdown + remark-gfm + rehype-highlight. Adds:
 *  - GitHub-style callouts/admonitions (`> [!NOTE]`)
 *  - Mermaid diagrams (fenced ```mermaid blocks)
 *  - Anchor ids on headings (match the TOC) with copy-friendly permalinks
 *  - Internal `.md` links that navigate the documentation tree
 *  - Task lists, tables, external links, graceful image fallbacks
 */

import type { ReactElement, ReactNode } from 'react';
import { cloneElement, createElement, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { DocCodeBlock, extractText } from './DocCodeBlock';
import { extractHeadings, slugify } from './frontmatter';

const CALLOUTS: Record<string, { label: string }> = {
  note: { label: 'Note' },
  info: { label: 'Info' },
  tip: { label: 'Tip' },
  important: { label: 'Important' },
  warning: { label: 'Warning' },
  caution: { label: 'Caution' },
  danger: { label: 'Danger' },
  success: { label: 'Success' },
  example: { label: 'Example' },
  quote: { label: 'Quote' },
};

function isCallout(text: string): { type: string; marker: string } | null {
  const m = text.match(/^\s*\[!(NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION|DANGER|SUCCESS|EXAMPLE|QUOTE)\]/i);
  if (!m) return null;
  return { type: m[1].toLowerCase(), marker: m[0] };
}

/** Remove the leading `[!TYPE]` marker from rendered children. */
function stripMarker(node: ReactNode, marker: string): ReactNode {
  if (typeof node === 'string') {
    const idx = node.indexOf(marker);
    if (idx !== -1) {
      const rest = node.slice(idx + marker.length);
      return rest.replace(/^[ \t]*\n?/, '') || null;
    }
    return node;
  }
  if (Array.isArray(node)) {
    let done = false;
    return node.map((child) => {
      if (done) return child;
      done = true;
      return stripMarker(child, marker);
    });
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as { props: { children?: ReactNode } };
    return cloneElement(
      node as unknown as ReactElement,
      { children: stripMarker(el.props.children, marker) } as Record<string, unknown>,
    );
  }
  return node;
}

/** Resolve a markdown link target relative to the current document. */
export function resolveDocPath(currentPath: string, href: string): string {
  if (href.startsWith('/')) return href.slice(1);
  const dir = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
  const base = dir ? `${dir}/` : '';
  const url = new URL(href, `http://docs.local/${base}`);
  const parts = url.pathname.split('/').filter((p) => p !== '' && p !== '.');
  return parts.join('/');
}

function Callout({ children }: { children?: ReactNode }) {
  const text = extractText(children);
  const callout = isCallout(text);
  if (!callout) {
    return <blockquote className="doc-blockquote">{children}</blockquote>;
  }
  const spec = CALLOUTS[callout.type] ?? CALLOUTS.note;
  return (
    <div className={`doc-callout doc-callout-${callout.type}`} role="note">
      <div className="doc-callout-title">
        <span className="doc-callout-label">{spec.label}</span>
      </div>
      <div className="doc-callout-body">{stripMarker(children, callout.marker)}</div>
    </div>
  );
}

interface DocMarkdownProps {
  content: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  showLineNumbers?: boolean;
}

export function DocMarkdown({ content, currentPath, onNavigate, showLineNumbers }: DocMarkdownProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const slugIdx = useRef(0);
  const slugQueue = useMemo(() => {
    slugIdx.current = 0;
    return headings.map((h) => h.slug);
  }, [headings]);

  const heading =
    (level: number) =>
    ({ children, ...rest }: { children?: ReactNode }) => {
      const text = extractText(children);
      const slug = slugQueue[slugIdx.current] ?? slugify(text);
      slugIdx.current += 1;
      return createElement(
        `h${level}`,
        { ...rest, id: slug, className: 'doc-heading' },
        children,
        <a href={`#${slug}`} className="doc-anchor" aria-label={`Jump to ${text}`} tabIndex={-1}>
          #
        </a>,
      );
    };

  const a = ({ href, children }: { href?: string; children?: ReactNode }) => {
    const target = href ?? '';
    if (!target) return <a href={target}>{children}</a>;
    if (target.startsWith('#')) {
      return (
        <a href={target} className="doc-link">
          {children}
        </a>
      );
    }
    const isExternal = /^(https?:|mailto:|tel:)/i.test(target);
    if (isExternal) {
      return (
        <a href={target} target="_blank" rel="noopener noreferrer" className="doc-link">
          {children}
        </a>
      );
    }
    const isDoc = /\.(md|mdx|markdown)$/i.test(target) || target.endsWith('/');
    if (isDoc) {
      const resolved = resolveDocPath(currentPath, target);
      return (
        <a
          href={`/docs?path=${encodeURIComponent(resolved)}`}
          className="doc-link"
          onClick={(e) => {
            e.preventDefault();
            onNavigate(resolved);
          }}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={target} target="_blank" rel="noopener noreferrer" className="doc-link">
        {children}
      </a>
    );
  };

  const img = ({ src, alt, ...rest }: { src?: string; alt?: string }) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      className="doc-img"
      {...rest}
      onError={(e) => {
        const el = e.currentTarget;
        el.outerHTML = `<span class="doc-img-missing">Image unavailable${alt ? `: ${alt}` : ''}</span>`;
      }}
    />
  );

  const components: Record<string, unknown> = {
    code: (props: unknown) => <DocCodeBlock {...(props as object)} showLineNumbers={showLineNumbers} />,
    pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    blockquote: Callout,
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    a,
    img,
    table: ({ children, ...rest }: { children?: ReactNode }) => (
      <div className="doc-table-wrap">
        <table {...rest}>{children}</table>
      </div>
    ),
    input: ({ type, checked }: { type?: string; checked?: boolean }) =>
      type === 'checkbox' ? (
        <span className="doc-task-check" aria-hidden="true">
          {checked ? '☑' : '☐'}
        </span>
      ) : null,
  };

  return (
    <div className="doc-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components as never}
        urlTransform={(value: string) => value}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
