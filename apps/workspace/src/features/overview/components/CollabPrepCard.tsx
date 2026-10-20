/**
 * VES-OVERVIEW-001: Collaboration Prep Card
 *
 * Surfaces the Andy McCraw Oct 21 collaboration package (exploration
 * record + one-pager/demo checklist) on the Overview dashboard. Read-only
 * projection over `collab-prep.fixtures.ts` — no writes, no authority.
 */

import { Link } from 'react-router-dom';
import type { CollabPrepViewModel } from '../collab-prep.fixtures';
import { collabPrepFixture } from '../collab-prep.fixtures';
import { SectionCard } from './SectionCard';

const TILE_ACCENT = 'var(--vestara-status-warning)';

function docHref(path: string): string {
  return `/files?focus=${encodeURIComponent(path)}`;
}

interface CollabPrepCardProps {
  prep?: CollabPrepViewModel;
}

export function CollabPrepCard({ prep = collabPrepFixture }: CollabPrepCardProps) {
  return (
    <SectionCard
      title="Collab Prep — Oct 21"
      badge="Wed Oct 21"
      actionLabel="Open docs"
      actionHref="/docs"
      accent={TILE_ACCENT}
      index={0}
    >
      <div className="mb-2 min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--vestara-text-primary)]">{prep.title}</p>
        <p className="truncate text-[11px] text-[var(--vestara-text-muted)]">{prep.counterpart}</p>
        <p className="truncate text-[11px] text-[var(--vestara-text-muted)]">
          {prep.schedule} · {prep.venue}{' '}
          <a
            href={prep.meetUrl}
            target="_blank"
            rel="noreferrer"
            className="mpg-link"
            title={`Join the Google Meet: ${prep.meetUrl}`}
          >
            Join Meet ›
          </a>
        </p>
        <p className="truncate text-[11px] text-[var(--vestara-text-muted)]" title={prep.agendaHint}>
          {prep.agendaHint}
        </p>
        <p className="mt-1 text-[11px] text-[var(--vestara-text-secondary)]">{prep.status}</p>
      </div>
      <ul className="space-y-1">
        {prep.docs.map((doc, i) => (
          <li key={doc.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
            <Link to={docHref(doc.path)} className="mpg-category-row" title={`${doc.label} · ${doc.detail}`}>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="mpg-icon-box"
                  style={{
                    color: TILE_ACCENT,
                    background: `color-mix(in srgb, ${TILE_ACCENT} 14%, transparent)`,
                    borderColor: `color-mix(in srgb, ${TILE_ACCENT} 35%, transparent)`,
                    width: '2rem',
                    height: '2rem',
                    fontSize: '0.85rem',
                    borderRadius: '0.5rem',
                  }}
                >
                  {'◈'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--vestara-text-primary)]">
                    {doc.label}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{doc.detail}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-[var(--vestara-border-subtle)] pt-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--vestara-text-muted)]">
          Demo — 5 stops · 10 min
        </p>
        <ol className="space-y-1">
          {prep.demoSteps.map((step, i) => (
            <li key={step.id} className="flex min-w-0 items-baseline gap-2">
              <span
                aria-hidden="true"
                className="shrink-0 tabular-nums text-[11px] font-bold text-[var(--vestara-text-muted)]"
              >
                {i + 1}.
              </span>
              <span className="min-w-0 truncate text-[12px] text-[var(--vestara-text-secondary)]">
                <span className="font-medium text-[var(--vestara-text-primary)]">{step.title}</span>
                {' — '}
                {step.detail}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 truncate text-[11px] text-[var(--vestara-text-muted)]" title={prep.questionsHint}>
          {prep.questionCount} questions ready — {prep.questionsHint}
        </p>
      </div>
    </SectionCard>
  );
}
