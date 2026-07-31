/**
 * Documentation context panel (right side).
 *
 * Shows the table of contents with scroll-spy, reading progress, related
 * documents (frontmatter + inline links), and cross-linked resources
 * (plans, agents, APIs) matched against live workspace data.
 */

import { useEffect, useMemo, useState } from 'react';
import type { AgentData, PlanData } from '../../lib/api';
import { getAgents, getPlans } from '../../lib/api';
import type { DocContent } from '../../lib/docs';
import { resolveDocPath } from './DocMarkdown';
import { useDocs } from './DocsContext';
import type { Heading } from './frontmatter';
import { metaList, parseFrontmatter } from './frontmatter';

interface DocTocProps {
  content: DocContent;
  headings: Heading[];
  activeSlug: string | null;
  progress: number;
  onJump: (slug: string) => void;
  onNavigate: (path: string) => void;
}

function scanInternalLinks(content: string): string[] {
  const out = new Set<string>();
  const re = /\[[^\]]*\]\(([^)\s]+\.(?:md|mdx|markdown))\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const href = m[1].replace(/^[./]*/, '');
    if (href) out.add(href);
  }
  return [...out];
}

function scanIds(content: string, prefix: string): string[] {
  const re = new RegExp(`\\b(${prefix}-[\\w-]+)`, 'g');
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.add(m[1]);
  return [...out];
}

function matchPlans(plans: PlanData[], ids: string[]): PlanData[] {
  if (ids.length === 0) return [];
  return plans.filter((p) => ids.includes(p.id) || ids.some((id) => p.title.toLowerCase().includes(id.toLowerCase())));
}

function matchAgents(agents: AgentData[], ids: string[]): AgentData[] {
  if (ids.length === 0) return [];
  return agents.filter(
    (a) => ids.includes(a.id) || ids.some((id) => (a.name ?? '').toLowerCase().includes(id.toLowerCase())),
  );
}

export function DocToc({ content, headings, activeSlug, progress, onJump, onNavigate }: DocTocProps) {
  const docs = useDocs();
  const docsWidth = docs.widths.toc;
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getPlans(), getAgents()]).then(([p, a]) => {
      if (cancelled) return;
      setPlans(p);
      setAgents(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fm = useMemo(() => parseFrontmatter(content.content), [content.content]);

  const related = useMemo(() => {
    const fromLinks = scanInternalLinks(content.content)
      .map((href) => resolveDocPath(content.path, href))
      .filter((p) => p !== content.path);
    const fromFrontmatter = metaList(fm.meta, 'related').map((v) => resolveDocPath(content.path, v));
    return [...new Set([...fromFrontmatter, ...fromLinks])];
  }, [content, fm.meta]);

  const planIds = useMemo(() => {
    const fromFront = metaList(fm.meta, 'plans');
    const fromContent = scanIds(content.content, 'pln');
    return [...new Set([...fromFront, ...fromContent])];
  }, [content, fm.meta]);

  const agentIds = useMemo(() => {
    const fromFront = metaList(fm.meta, 'agents');
    const fromContent = scanIds(content.content, 'agent');
    return [...new Set([...fromFront, ...fromContent])];
  }, [content, fm.meta]);

  const apis = useMemo(() => metaList(fm.meta, 'api'), [fm.meta]);
  const specs = useMemo(() => metaList(fm.meta, 'specification'), [fm.meta]);

  const matchedPlans = useMemo(() => matchPlans(plans, planIds), [plans, planIds]);
  const matchedAgents = useMemo(() => matchAgents(agents, agentIds), [agents, agentIds]);

  const showToc = headings.length > 0;
  const hasRelated =
    related.length > 0 || matchedPlans.length > 0 || matchedAgents.length > 0 || apis.length > 0 || specs.length > 0;

  return (
    <div className="doc-toc" style={{ width: docsWidth }}>
      <div className="doc-toc-progress">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Reading progress</span>
        <div className="doc-progress-track" aria-hidden="true">
          <div className="doc-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <span className="text-[10px] text-zinc-400 tabular-nums">{Math.round(progress)}%</span>
      </div>

      {showToc && (
        <nav className="doc-toc-section" aria-label="On this page">
          <div className="doc-toc-section-title">On this page</div>
          <ul className="doc-toc-list">
            {headings.map((h) => (
              <li key={h.slug} style={{ paddingLeft: `${(h.depth - 1) * 10}px` }}>
                <a
                  href={`#${h.slug}`}
                  className={`doc-toc-link ${activeSlug === h.slug ? 'doc-toc-active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onJump(h.slug);
                  }}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {hasRelated && (
        <div className="doc-toc-section">
          <div className="doc-toc-section-title">Related</div>

          {related.length > 0 && (
            <ul className="doc-toc-list">
              {related.map((p) => (
                <li key={p}>
                  <a
                    href={`/docs?path=${encodeURIComponent(p)}`}
                    className="doc-toc-link"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(p);
                    }}
                  >
                    <span className="doc-toc-file">▸</span> {p.split('/').pop()}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {matchedPlans.length > 0 && (
            <div className="doc-toc-group">
              <div className="doc-toc-group-label">Plans</div>
              {matchedPlans.map((p) => (
                <a
                  key={p.id}
                  href={`/projects?plan=${encodeURIComponent(p.id)}`}
                  className="doc-toc-chip"
                  title={p.title}
                >
                  <span className="doc-toc-chip-dot plan" />
                  {p.title}
                </a>
              ))}
            </div>
          )}

          {matchedAgents.length > 0 && (
            <div className="doc-toc-group">
              <div className="doc-toc-group-label">Agents</div>
              {matchedAgents.map((a) => (
                <a key={a.id} href="/agents" className="doc-toc-chip" title={a.name ?? a.id}>
                  <span className="doc-toc-chip-dot agent" />
                  {a.name ?? a.id}
                </a>
              ))}
            </div>
          )}

          {specs.length > 0 && (
            <div className="doc-toc-group">
              <div className="doc-toc-group-label">Specifications</div>
              {specs.map((s) => (
                <span key={s} className="doc-toc-chip">
                  <span className="doc-toc-chip-dot spec" />
                  {s}
                </span>
              ))}
            </div>
          )}

          {apis.length > 0 && (
            <div className="doc-toc-group">
              <div className="doc-toc-group-label">API</div>
              {apis.map((s) => (
                <span key={s} className="doc-toc-chip">
                  <span className="doc-toc-chip-dot api" />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
