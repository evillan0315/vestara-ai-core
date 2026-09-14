/**
 * VES-OVERVIEW-001: Overview Hero Component — now with dynamic, real-time rotating title
 * and time-aware greeting. Title pool covers all topics you liked; daily shift
 * picks the topic, real-time interval rotates titles within it.
 */

import { useEffect, useMemo, useState } from 'react';
import { RouteHero } from '../../../components/layout/PageHero/RouteHero';
import type { MorningBriefing } from '../../../hooks/useMorningBriefing';
import type { OverviewWorkspaceSummary } from '../overview.types';

interface OverviewHeroProps {
  workspace: OverviewWorkspaceSummary;
  stats?: { projects: number; agentsOnline: number; activeWork: number };
  briefing?: MorningBriefing | null;
  briefingLoading?: boolean;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return iso;
  }
}
function formatFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' });
  } catch {
    return iso;
  }
}

function getTimeBasedGreeting(now = new Date()): { greeting: string; period: string; emoji: string } {
  const h = now.getHours();
  if (h < 12) return { greeting: 'Good Morning', period: 'morning', emoji: '☀️' };
  if (h < 18) return { greeting: 'Good Afternoon', period: 'afternoon', emoji: '🌤️' };
  return { greeting: 'Good Evening', period: 'evening', emoji: '🌙' };
}

function humanizeBriefing(briefing: MorningBriefing): { greeting: string; bullets: string[]; emoji: string } {
  const { greeting, period, emoji } = getTimeBasedGreeting();
  const greetingStr = `${greeting} Director, here is your ${period} briefing for today.`;
  const bullets: string[] = [];
  const rh = briefing.details.repoHealth || '';
  const ws = briefing.details.workspaceStatus || '';
  const act = briefing.details.activity || '';

  const branchMatch = rh.match(/Branch:\s*(\S+)/);
  const branch = branchMatch ? branchMatch[1] : 'main';
  const buildMissing = rh.includes('MISSING');
  const modifiedCount = (rh.match(/^\s*M\s/mg) || []).length;
  const commitLines = rh.split('\n').filter((l) => l.trim().startsWith('- ')).slice(0, 2);
  const lastCommit = commitLines[0]?.replace(/^\s*-\s*/, '').trim() || '';
  if (branch) bullets.push(`Your repository is on branch \u2018${branch}\u2019${lastCommit ? ` \u2014 latest commit: ${lastCommit}` : ''}.`);
  if (buildMissing) bullets.push('The build is currently missing its compiled output. Run `bash build-order.sh` to restore it.');
  else bullets.push('The build output is present and ready.');
  if (modifiedCount > 0) bullets.push(`You have ${modifiedCount} modified files waiting for attention.`);
  else bullets.push('Your working tree is clean.');

  if (ws.includes('fingerprint')) {
    const fpMatch = ws.match(/fingerprint:\s*(\S+)/);
    if (fpMatch) bullets.push(`Workspace \u2018${ws.match(/id:\s*(\S+)/)?.[1] || 'vestara-ai-core'}\u2019 is fingerprinted at ${fpMatch[1].slice(0, 8)}.`);
  }

  const sessionCount = act.split('\n').filter((l) => l.trim().startsWith('-')).length;
  if (sessionCount > 0) bullets.push(`In the Activity Room, there are ${sessionCount} recent sessions. The latest activity is ready for review.`);
  else bullets.push('Activity has been quiet since yesterday.');

  bullets.push(`This briefing was generated at ${formatFull(briefing.executedAt)}.`);

  return { greeting: greetingStr, bullets, emoji };
}

// ─── Rotating Hero Topic System — you liked all, so we keep all and shift daily ───
type TopicId = 'pulse' | 'insight' | 'command' | 'mantra' | 'spotlight';
const TOPICS: TopicId[] = ['pulse', 'insight', 'command', 'mantra', 'spotlight'];
const TOPIC_LABELS: Record<TopicId, string> = {
  pulse: 'Live Pulse',
  insight: 'Director’s Insight',
  command: 'Command Center',
  mantra: 'Mantra',
  spotlight: 'Spotlight',
};

function hashDay(date = new Date()): number {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}
function getStoredTopic(): TopicId | null {
  try {
    const v = localStorage.getItem('vestara:hero:topicOverride');
    if (v && (TOPICS as string[]).includes(v)) return v as TopicId;
  } catch {}
  return null;
}
function getStoredInterval(): number {
  try {
    const v = localStorage.getItem('vestara:hero:intervalMs');
    const n = v ? parseInt(v, 10) : 8000;
    if ([5000, 8000, 10000, 15000].includes(n)) return n;
  } catch {}
  return 8000;
}
function getTodayTopic(): TopicId {
  const stored = getStoredTopic();
  if (stored) return stored;
  return TOPICS[hashDay() % TOPICS.length];
}

function getTitlesForTopic(topic: TopicId, ctx: { briefing?: MorningBriefing | null; workspace: OverviewWorkspaceSummary; stats?: { projects: number; agentsOnline: number; activeWork: number } }): string[] {
  const { greeting, emoji } = getTimeBasedGreeting();
  const now = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  switch (topic) {
    case 'pulse': {
      const branch = ctx.briefing?.details.repoHealth.match(/Branch:\s*(\S+)/)?.[1] ?? 'main';
      const buildMissing = ctx.briefing?.details.repoHealth.includes('MISSING') ?? true;
      const lastCommit = ctx.briefing?.details.repoHealth.split('\n').find((l) => l.trim().startsWith('- '))?.replace(/^\s*-\s*/, '').slice(0, 40) ?? 'sidebar convergence';
      return [
        `${ctx.stats?.projects ?? 3} projects · ${ctx.stats?.agentsOnline ?? 2} agents online — turning ideas into production`,
        `Branch ${branch} · ${buildMissing ? 'Build missing — action needed' : 'Build ready — clear to ship'}`,
        `Latest: ${lastCommit} — live pulse`,
        `Activity Room: ${ctx.briefing ? ctx.briefing.details.activity.split('\n').filter((l) => l.trim().startsWith('-')).length : 5} sessions — ${now}`,
        `${ctx.workspace.name} · ${ctx.workspace.health === 'healthy' ? 'Healthy' : ctx.workspace.health} — ${now}`,
      ];
    }
    case 'insight': {
      const bullets = ctx.briefing ? humanizeBriefing(ctx.briefing).bullets : [];
      return [
        bullets[1] ?? 'Your build is ready — review before you plan.',
        bullets[2] ?? 'You have modified files waiting for attention.',
        'Today’s focus: Orchestrate with AI agents — delegate, verify, ship.',
        'Health 8.2/10 — documentation is your next 10× lever.',
        'Suggestion: Review Activity Room before next plan.',
      ];
    }
    case 'command': {
      return [
        `${greeting} Director — ${ctx.stats?.activeWork ?? 0} active items · ${ctx.workspace.name}`,
        `Command mode: ${getTimeBasedGreeting().period} review — ${now}`,
        `${emoji} ${greeting} — ${ctx.workspace.name} · ${ctx.stats?.agentsOnline ?? 2} agents online`,
        `Briefing at ${ctx.briefing ? formatTime(ctx.briefing.executedAt) : '08:00'} — workspace ready`,
      ];
    }
    case 'mantra': {
      return [
        'Build Without Limits',
        'Ideas organize. Work happens. Progress compounds.',
        'Turn ideas into production.',
        'Orchestrate with AI — build a more capable you.',
        'A more capable tomorrow, built today.',
      ];
    }
    case 'spotlight': {
      return [
        'Spotlight: Live Browser — automate the web at 127.0.0.1:4096',
        'Spotlight: Marketplace — discover agents, skills, themes',
        'Tip: Use @vestara in Activity Room to summon the Director',
        'Spotlight: Evidence pipeline — every verify leaves a bundle',
        `Spotlight: ${ctx.workspace.name} — ${ctx.stats?.projects ?? 3} projects ready`,
      ];
    }
  }
}

function getHeroExtras(topic: TopicId, ctx: { briefing?: MorningBriefing | null; workspace: OverviewWorkspaceSummary; stats?: { projects: number; agentsOnline: number; activeWork: number }; onOpenBriefing: () => void }) {
  const { greeting } = getTimeBasedGreeting();
  switch (topic) {
    case 'pulse':
      return {
        actions: [
          { label: 'View Activity', to: '/activity', glyph: '●' },
          { label: 'Check Health', to: '/diagnostics', glyph: '◉' },
        ],
        checklistTitle: `Live Pulse — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        checklist: [
          `◇ Branch ${ctx.briefing?.details.repoHealth.match(/Branch:\s*(\S+)/)?.[1] ?? 'main'} · ${ctx.briefing?.details.repoHealth.includes('MISSING') ? 'Build missing' : 'Build ready'}`,
          `◇ ${ctx.briefing?.details.repoHealth.split('\n').find((l) => l.trim().startsWith('- '))?.replace(/^\s*-\s*/, '').slice(0, 32) ?? 'Latest commit ready'} — live`,
          `◇ ${ctx.stats?.agentsOnline ?? 2} agents online · ${ctx.stats?.activeWork ?? 0} active`,
        ],
      };
    case 'insight':
      return {
        actions: [
          { label: 'View Briefing', onClick: ctx.onOpenBriefing, glyph: '☀️' },
          { label: "Today's Focus", to: '/activity', glyph: '◇' },
        ],
        checklistTitle: 'Director’s Insight — Today',
        checklist: ctx.briefing ? humanizeBriefing(ctx.briefing).bullets.slice(1, 4).map((b) => `◇ ${b.slice(0, 48)}`) : ['◇ Orchestrate with AI agents', '◇ Review 3 modified files', '◇ Health 8.2/10 — docs next'],
      };
    case 'command':
      return {
        actions: [
          { label: 'Activity Room', to: '/activity', glyph: '▦' },
          { label: 'Terminal', to: '/terminal', glyph: '›' },
        ],
        checklistTitle: `${greeting} — Command Center`,
        checklist: [
          `◇ ${greeting} review — ${ctx.workspace.name}`,
          `◇ ${ctx.stats?.activeWork ?? 0} active · ${ctx.stats?.projects ?? 3} projects`,
          `◇ Briefing ${ctx.briefing ? formatTime(ctx.briefing.executedAt) : '08:00'} — ready`,
        ],
      };
    case 'mantra':
      return {
        actions: [
          { label: 'Start Building', to: '/projects', primary: true, glyph: '✦' },
          { label: 'Browse Marketplace', to: '/marketplace', glyph: '▦' },
        ],
        checklistTitle: 'A More Capable Tomorrow',
        checklist: [
          '◇ Turn ideas into production',
          '◇ Orchestrate with AI agents',
          '◇ Build a more capable you',
        ],
      };
    case 'spotlight':
      return {
        actions: [
          { label: 'Discover', to: '/marketplace', glyph: '▦' },
          { label: 'Evidence', to: '/evidence', glyph: '⬢' },
        ],
        checklistTitle: 'Spotlight — Today',
        checklist: [
          '◇ Live Browser — 127.0.0.1:4096',
          '◇ Marketplace — agents & skills',
          '◇ Evidence pipeline — every verify',
        ],
      };
  }
}

export function OverviewHero({ workspace, stats, briefing, briefingLoading }: OverviewHeroProps) {
  const healthy = workspace.health === 'healthy';
  const [open, setOpen] = useState(false);
  const human = briefing ? humanizeBriefing(briefing) : null;

  // Daily topic shifts — same topic all day, different tomorrow; manual override via Settings → Hero & Briefing
  const [todayTopic, setTodayTopic] = useState<TopicId>(() => getTodayTopic());
  const [intervalMs, setIntervalMs] = useState<number>(() => getStoredInterval());
  useEffect(() => {
    const onChange = () => {
      setTodayTopic(getTodayTopic());
      setIntervalMs(getStoredInterval());
    };
    window.addEventListener('hero-settings-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('hero-settings-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  const titles = useMemo(() => getTitlesForTopic(todayTopic, { briefing, workspace, stats }), [todayTopic, briefing, workspace, stats]);
  const [titleIdx, setTitleIdx] = useState(0);

  // Real-time rotation within today's topic — interval comes from Settings (5s/8s/10s/15s)
  useEffect(() => {
    setTitleIdx(0);
    const id = setInterval(() => {
      setTitleIdx((i) => (i + 1) % titles.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [titles.length, todayTopic, intervalMs]);

  const dynamicTitle = titles[titleIdx] ?? 'Build Without Limits';
  const topicLabel = TOPIC_LABELS[todayTopic];
  const heroExtras = useMemo(() => getHeroExtras(todayTopic, { briefing, workspace, stats, onOpenBriefing: () => setOpen(true) }), [todayTopic, briefing, workspace, stats]);

  return (
    <>
      <RouteHero
        title={dynamicTitle}
        eyebrow={`Welcome to Vestara · ${topicLabel} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
        subtitle={undefined}
        actions={heroExtras.actions as any}
        checklistTitle={heroExtras.checklistTitle}
        checklist={heroExtras.checklist}
        checklistLabel={heroExtras.checklistTitle}
        meta={
          <span className="mpg-tag-pill" style={{ color: 'var(--vestara-text-secondary)' }}>
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)',
                boxShadow: `0 0 6px ${healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)'}`,
              }}
            />
            {workspace.name} · {healthy ? 'Healthy' : workspace.health}
          </span>
        }
        stats={
          stats
            ? [
                { label: 'projects', value: stats.projects },
                { label: 'agents online', value: stats.agentsOnline },
                { label: 'active', value: stats.activeWork },
              ]
            : undefined
        }
        quote={
          briefing
            ? `${human?.emoji ?? '☀️'} ${human?.greeting ?? 'Good Morning Director, here is your morning briefing for today.'} — ${formatTime(briefing.executedAt)} · ${human?.bullets[0] ?? ''}`
            : undefined
        }
      />
      {briefing && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full text-left rounded-xl border border-[var(--vestara-amber)]/30 bg-[var(--vestara-amber)]/10 px-4 py-3 hover:bg-[var(--vestara-amber)]/15 transition-colors cursor-pointer"
          aria-label="Open detailed morning briefing"
        >
          <div className="text-xs font-semibold text-[var(--vestara-amber)]">{human?.greeting ?? 'Good Morning Director, here is your morning briefing for today.'}</div>
          <div className="mt-1 text-[12px] leading-relaxed text-[var(--vestara-text-secondary)]">
            {human?.bullets.slice(0, 2).join(' ')}
          </div>
          <div className="mt-2 text-[10px] text-[var(--vestara-text-dim)]">
            Executed at {formatFull(briefing.executedAt)} · Click to see the full, human-readable briefing →
          </div>
          <div className="mt-2 text-[9px] text-[var(--vestara-text-dim)]">
            Hero topic today: {topicLabel} · title rotates every {intervalMs / 1000}s · {titleIdx + 1}/{titles.length} · change in Settings → Hero & Briefing
          </div>
        </button>
      )}
      {briefingLoading && !briefing && (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-3 text-xs text-[var(--vestara-text-muted)] animate-pulse">
          Preparing your {getTimeBasedGreeting().period} briefing for today…
        </div>
      )}
      {open && briefing && human && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Morning briefing detail"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-xl border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-5 py-4">
              <h2 className="text-sm font-bold text-[var(--vestara-text-primary)]">{human.emoji} {human.greeting.split(',')[0]}</h2>
              <p className="text-xs text-[var(--vestara-amber)] mt-1">{human.greeting} — {formatFull(briefing.executedAt)}</p>
              <p className="text-[11px] text-[var(--vestara-text-dim)] mt-1">Briefing ID {briefing.id} · Exact execution time preserved · Hero: {topicLabel}</p>
            </div>
            <div className="px-5 py-4 space-y-5 text-sm leading-relaxed">
              <p className="text-[13px] text-[var(--vestara-text)]">
                {human.greeting.split(',')[0]}! Here&apos;s what&apos;s happening in <strong>vestara-ai-core</strong> today.
              </p>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--vestara-amber)]">At a glance</h3>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-[12.5px] text-[var(--vestara-text-secondary)]">
                  {human.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
              <section className="rounded-lg bg-[var(--vestara-surface-panel-raised)] border border-[var(--vestara-border-subtle)] p-3">
                <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)]">What this means for you</h3>
                <p className="mt-1 text-[12px] text-[var(--vestara-text-secondary)]">
                  Your workspace is ready to continue work. If the build is missing, run the build first. Review the {human.bullets[3]?.includes('modified') ? 'modified files' : 'activity'} before starting new tasks. The Activity Room has the latest conversations and agent sessions if you want to catch up.
                </p>
              </section>
              <details className="rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--vestara-text-muted)]">Show raw details (repo health, workspace, activity)</summary>
                <div className="mt-2 space-y-2">
                  <pre className="whitespace-pre-wrap break-words rounded bg-[var(--vestara-surface-panel)] border p-2 text-[11px] text-[var(--vestara-text-dim)]">{briefing.details.repoHealth}</pre>
                  <pre className="whitespace-pre-wrap break-words rounded bg-[var(--vestara-surface-panel)] border p-2 text-[11px] text-[var(--vestara-text-dim)]">{briefing.details.workspaceStatus}</pre>
                  <pre className="whitespace-pre-wrap break-words rounded bg-[var(--vestara-surface-panel)] border p-2 text-[11px] text-[var(--vestara-text-dim)]">{briefing.details.activity?.slice(0, 800)}</pre>
                </div>
              </details>
            </div>
            <div className="sticky bottom-0 flex justify-end border-t border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-5 py-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[var(--vestara-accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90">
                Got it, thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
