// AssistantMarkdown — token-styled GFM rendering for assistant bubbles.
// Raw HTML is never rendered (no rehype-raw): model output stays inert.
// User echoes stay plain text (see FloatingAssistant) — only assistant
// bubbles take this path.

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const BODY = 'text-[length:var(--vestara-font-size-label)] leading-relaxed text-[var(--vestara-text-shell-secondary)]';

const components: Components = {
  p: ({ children }) => <p className={BODY}>{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--vestara-text-shell-primary)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <div className="text-[length:var(--vestara-font-size-body)] font-semibold text-[var(--vestara-text-shell-primary)]">
      {children}
    </div>
  ),
  h2: ({ children }) => (
    <div className="text-[length:var(--vestara-font-size-body-small)] font-semibold text-[var(--vestara-text-shell-primary)]">
      {children}
    </div>
  ),
  h3: ({ children }) => (
    <div className="text-[length:var(--vestara-font-size-label)] font-semibold text-[var(--vestara-text-shell-primary)]">
      {children}
    </div>
  ),
  h4: ({ children }) => (
    <div className="text-[length:var(--vestara-font-size-label)] font-semibold text-[var(--vestara-text-shell-primary)]">
      {children}
    </div>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 space-y-1 marker:text-[var(--vestara-text-shell-muted)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 space-y-1 marker:text-[var(--vestara-text-shell-muted)]">{children}</ol>
  ),
  li: ({ children }) => <li className={BODY}>{children}</li>,
  code: ({ className, children }) =>
    className ? (
      <code className="font-mono text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-primary)]">
        {children}
      </code>
    ) : (
      <code className="font-mono text-[length:var(--vestara-font-size-caption)] bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] rounded px-1 py-px text-[var(--vestara-text-shell-primary)]">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="bg-[var(--vestara-surface-shell-canvas)] border border-[var(--vestara-border-shell)] rounded-[var(--vestara-radius-md)] p-2 overflow-x-auto">
      {children}
    </pre>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--vestara-accent-shell)] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--vestara-accent-shell)]/40 pl-2 italic text-[var(--vestara-text-shell-muted)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-[var(--vestara-border-shell)] my-2" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[length:var(--vestara-font-size-caption)]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--vestara-border-shell)] px-2 py-1 text-left font-semibold text-[var(--vestara-text-shell-primary)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--vestara-border-shell)] px-2 py-1 text-[var(--vestara-text-shell-secondary)]">
      {children}
    </td>
  ),
};

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
