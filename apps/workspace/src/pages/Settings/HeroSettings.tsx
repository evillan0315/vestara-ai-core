import { useEffect, useMemo, useState } from 'react';
import { useMorningBriefing } from '../../hooks/useMorningBriefing';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { Button, input, ReferenceCard, SettingsRow, Status } from './settings-ui';

type TopicId = 'pulse' | 'insight' | 'command' | 'mantra' | 'spotlight';
const TOPICS: TopicId[] = ['pulse', 'insight', 'command', 'mantra', 'spotlight'];
const TOPIC_LABELS: Record<TopicId, string> = {
  pulse: 'Live Pulse',
  insight: 'Director’s Insight',
  command: 'Command Center',
  mantra: 'Mantra',
  spotlight: 'Spotlight',
};

const STORAGE_TOPIC = 'vestara:hero:topicOverride';
const STORAGE_INTERVAL = 'vestara:hero:intervalMs';

function getStoredTopic(): TopicId | null {
  try {
    const v = localStorage.getItem(STORAGE_TOPIC);
    if (v && (TOPICS as string[]).includes(v)) return v as TopicId;
  } catch {}
  return null;
}
function getStoredInterval(): number {
  try {
    const v = localStorage.getItem(STORAGE_INTERVAL);
    const n = v ? parseInt(v, 10) : 8000;
    if ([5000, 8000, 10000, 15000].includes(n)) return n;
  } catch {}
  return 8000;
}

export function useHeroSettingsState() {
  const { briefing, briefings } = useMorningBriefing();
  const [topicOverride, setTopicOverride] = useState<TopicId | null>(() => getStoredTopic());
  const [intervalMs, setIntervalMs] = useState<number>(() => getStoredInterval());
  const [workspaceHealth, setWorkspaceHealth] = useState<string>('unknown');
  const [stats, setStats] = useState<{ projects: number; agentsOnline: number } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    fetch('/api/workspace').then((r) => r.json()).then((d) => setWorkspaceHealth(d?.health ?? d?.presentation?.health ?? 'unknown')).catch(() => {});
    fetch('/api/agents').then((r) => r.json()).then((d) => setStats({ projects: d?.agents?.length ?? 0, agentsOnline: d?.agents?.filter((a: any) => a.status === 'active').length ?? 0 })).catch(() => {});
  }, [previewKey]);

  const currentTopic = useMemo(() => {
    if (topicOverride) return topicOverride;
    const key = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return TOPICS[h % TOPICS.length];
  }, [topicOverride, previewKey]);

  const setTopic = (t: TopicId | 'auto') => {
    if (t === 'auto') {
      localStorage.removeItem(STORAGE_TOPIC);
      setTopicOverride(null);
    } else {
      localStorage.setItem(STORAGE_TOPIC, t);
      setTopicOverride(t);
    }
    setPreviewKey((k) => k + 1);
    window.dispatchEvent(new Event('hero-settings-changed'));
  };

  const setIntervalValue = (n: number) => {
    localStorage.setItem(STORAGE_INTERVAL, String(n));
    setIntervalMs(n);
    window.dispatchEvent(new Event('hero-settings-changed'));
  };

  const refreshTopic = () => {
    const other = TOPICS.filter((t) => t !== currentTopic);
    const pick = other[Math.floor(Math.random() * other.length)];
    setTopic(pick);
  };

  const resetDaily = () => {
    localStorage.removeItem(STORAGE_TOPIC);
    setTopicOverride(null);
    setPreviewKey((k) => k + 1);
    window.dispatchEvent(new Event('hero-settings-changed'));
  };

  return {
    briefing,
    briefings,
    topicOverride,
    intervalMs,
    workspaceHealth,
    stats,
    previewKey,
    currentTopic,
    setTopic,
    setIntervalValue,
    refreshTopic,
    resetDaily,
    setTopicOverride,
    setIntervalMs,
    setPreviewKey,
  };
}

export type HeroSettingsState = ReturnType<typeof useHeroSettingsState>;

export function HeroBriefingCard({
  hero,
  className = '',
}: {
  hero: HeroSettingsState;
  className?: string;
}) {
  const {
    briefing,
    briefings,
    topicOverride,
    intervalMs,
    workspaceHealth,
    stats,
    previewKey,
    currentTopic,
    setTopic,
    setIntervalValue,
    refreshTopic,
    resetDaily,
    setTopicOverride,
    setIntervalMs,
    setPreviewKey,
  } = hero;
  return (
    <ReferenceCard
      icon={navIcon('dashboard')}
      title="Hero & Briefing"
      description="Choose the Hero topic, rotation speed and preview the live Hero as it appears on /overview. Changes apply immediately via local storage and the daily auto-shift."
      className={`flex h-full flex-col [&>.st-card-body]:flex [&>.st-card-body]:flex-col [&>.st-card-body]:flex-1 ${className}`}
      actions={
        <>
          <Button onClick={() => setPreviewKey((k) => k + 1)}>↺ Refresh preview</Button>
          <Button primary onClick={refreshTopic}>Shuffle topic</Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col">
        <SettingsRow
          label="Current system"
          value={
            <span className="text-xs text-[var(--vestara-text-muted)]">
              Health: <Status value={workspaceHealth} /> · Briefing: {briefing ? new Date(briefing.executedAt).toLocaleString() : 'none'} · Total briefings: {briefings.length}
            </span>
          }
        />
        <SettingsRow
          label="Today’s topic (auto)"
          value={
            <span className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--vestara-amber)]">{TOPIC_LABELS[currentTopic]}</span>
              <span className="text-[var(--vestara-text-dim)]">{topicOverride ? '(manual override)' : '(daily auto — ' + new Date().toLocaleDateString() + ')'}</span>
            </span>
          }
        />
        <SettingsRow
          label="Topic"
          description="Auto = daily hash (pulse → insight → command → mantra → spotlight). Manual locks the Hero to that topic until you reset."
          value={
            <select
              value={topicOverride ?? 'auto'}
              onChange={(e) => setTopic(e.target.value as TopicId | 'auto')}
              className={`${input} min-h-9`}
            >
              <option value="auto">Auto (daily shift)</option>
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {TOPIC_LABELS[t]}
                </option>
              ))}
            </select>
          }
        />
        <SettingsRow
          label="Title rotation — real time"
          description="How often the large Hero title cycles within today’s topic (one-liner, -2px, truncated). Change is live."
          value={
            <select
              value={String(intervalMs)}
              onChange={(e) => setIntervalValue(parseInt(e.target.value, 10))}
              className={`${input} min-h-9`}
            >
              <option value="5000">5s — fast</option>
              <option value="8000">8s — standard</option>
              <option value="10000">10s — calm</option>
              <option value="15000">15s — slow</option>
            </select>
          }
        />
        <SettingsRow
          label="Options based on current system"
          value={
            <div className="text-xs text-[var(--vestara-text-muted)] text-right">
              <div>Workspace: {workspaceHealth}</div>
              <div>Agents/projects: {stats ? `${stats.agentsOnline} / ${stats.projects}` : 'loading…'}</div>
              <div>Briefing: {briefing ? `${briefing.summary.slice(0, 48)}…` : 'none yet'}</div>
              <div className="mt-1 flex gap-1 justify-end">
                {TOPICS.map((t) => (
                  <span key={t} className={`px-1.5 py-0.5 rounded text-[var(--vestara-font-size-xs)] border ${t === currentTopic ? 'bg-[var(--vestara-amber)]/15 border-[var(--vestara-amber)]/30 text-[var(--vestara-amber)]' : 'border-[var(--vestara-border-subtle)]'}`}>
                    {TOPIC_LABELS[t]}
                  </span>
                ))}
              </div>
            </div>
          }
        />
        <div className="mt-auto border-t border-[var(--vestara-border-subtle)] pt-[var(--vestara-spacing-section)]">
          <div className="flex items-center gap-2 text-[var(--vestara-font-size-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--vestara-text-muted)]">
            <span className="size-2 rounded-full bg-[var(--vestara-amber)]" aria-hidden="true" />
            Live Preview — {TOPIC_LABELS[currentTopic]} · Hero title rotates every {intervalMs / 1000}s
          </div>
          <div className="mt-3 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] p-4 text-xs">
            <div className="font-semibold text-[var(--vestara-amber)]">{TOPIC_LABELS[currentTopic]} · Hero title rotates every {intervalMs / 1000}s</div>
            <div className="mt-2 text-[var(--vestara-text-muted)]">Visit <a href="/overview" className="underline">/overview</a> to see the one-liner title, greeting “{(() => { const h = new Date().getHours(); if (h < 12) return 'Good Morning'; if (h < 18) return 'Good Afternoon'; return 'Good Evening'; })()} Director…” and the dynamic checklist card “A More Capable Tomorrow” now topic-aware.</div>
            <div className="mt-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-dim)]">Storage: {STORAGE_TOPIC}={topicOverride ?? 'auto'} · {STORAGE_INTERVAL}={intervalMs} · Preview key {previewKey}</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={resetDaily}
              className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2.5 text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-secondary)] transition-colors hover:border-[var(--vestara-accent-border)] hover:text-[var(--vestara-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset"
            >
              Reset to daily auto
            </button>
            <button
              type="button"
              onClick={refreshTopic}
              className="rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent-dark)] px-3 py-2.5 text-[var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-surface-canvas)] transition-colors hover:bg-[var(--vestara-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset"
            >
              Refresh topic
            </button>
            <button
              type="button"
              onClick={() => { localStorage.removeItem(STORAGE_TOPIC); localStorage.removeItem(STORAGE_INTERVAL); setTopicOverride(null); setIntervalMs(8000); window.dispatchEvent(new Event('hero-settings-changed')); setPreviewKey((k) => k + 1); }}
              className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2.5 text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-secondary)] transition-colors hover:border-[var(--vestara-accent-border)] hover:text-[var(--vestara-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset"
            >
              Restore defaults
            </button>
          </div>
        </div>
      </div>
    </ReferenceCard>
  );
}

export function HeroLivePreview({
  hero,
  className = '',
}: {
  hero: HeroSettingsState;
  className?: string;
}) {
  const { currentTopic, intervalMs, topicOverride, previewKey } = hero;
  return (
    <ReferenceCard
      icon={navIcon('sessions')}
      tone="info"
      title="Live Preview"
      description="The exact Hero the Director sees, updating in real time."
      className={`flex h-full flex-col ${className}`}
    >
      <div className="flex flex-1 flex-col justify-center rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] p-4 text-xs">
        <div className="font-semibold text-[var(--vestara-amber)]">{TOPIC_LABELS[currentTopic]} · Hero title rotates every {intervalMs / 1000}s</div>
        <div className="mt-2 text-[var(--vestara-text-muted)]">Visit <a href="/overview" className="underline">/overview</a> to see the one-liner title, greeting “{(() => { const h = new Date().getHours(); if (h < 12) return 'Good Morning'; if (h < 18) return 'Good Afternoon'; return 'Good Evening'; })()} Director…” and the dynamic checklist card “A More Capable Tomorrow” now topic-aware.</div>
        <div className="mt-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-dim)]">Storage: {STORAGE_TOPIC}={topicOverride ?? 'auto'} · {STORAGE_INTERVAL}={intervalMs} · Preview key {previewKey}</div>
      </div>
    </ReferenceCard>
  );
}

export function HeroActionButtons({
  hero,
  className = '',
}: {
  hero: HeroSettingsState;
  className?: string;
}) {
  const { refreshTopic, resetDaily, setTopicOverride, setIntervalMs, setPreviewKey } = hero;
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={resetDaily}
        className="flex flex-1 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-3 py-3 text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)] transition-colors hover:border-[var(--vestara-accent-border)] hover:text-[var(--vestara-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset"
      >
        Reset to daily auto
      </button>
      <button
        type="button"
        onClick={refreshTopic}
        className="flex flex-1 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent-dark)] px-3 py-3 text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-surface-canvas)] transition-colors hover:bg-[var(--vestara-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset"
      >
        Refresh topic (random)
      </button>
      <button
        type="button"
        onClick={() => { localStorage.removeItem(STORAGE_TOPIC); localStorage.removeItem(STORAGE_INTERVAL); setTopicOverride(null); setIntervalMs(8000); window.dispatchEvent(new Event('hero-settings-changed')); setPreviewKey((k) => k + 1); }}
        className="flex flex-1 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-3 py-3 text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)] transition-colors hover:border-[var(--vestara-accent-border)] hover:text-[var(--vestara-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset"
      >
        Restore defaults
      </button>
    </div>
  );
}

export default function HeroSettings() {
  const hero = useHeroSettingsState();
  return (
    <div className="grid min-w-0 items-start gap-[var(--vestara-spacing-section)] lg:grid-cols-[minmax(0,1fr)_24rem]">
      <HeroBriefingCard hero={hero} />
      <div className="grid min-w-0 gap-[var(--vestara-spacing-section)]">
        <HeroLivePreview hero={hero} />
        <HeroActionButtons hero={hero} />
      </div>
    </div>
  );
}
