/**
 * AR-UI-C13: Human Participant Drawer
 *
 * Drawer for human participants in the Activity Room.
 * Displays human identity, role, presence, and activity history.
 *
 * Architecture Traceability:
 *   AR-UI-C: Reusable Participant Drawer (phases 7-13)
 *   Phase 13: AR-UX-130..132 — Human Participant Drawer
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { Tabs } from '../../components/ui/Tabs';
import type { ParticipantProjection } from '@vestara/activity-room';

// ─── Types ─────────────────────────────────────────────────────

interface HumanParticipantDrawerProps {
  open: boolean;
  onClose: () => void;
  participantId: string;
  participant: ParticipantProjection;
}

interface HumanProfile {
  id: string;
  name: string;
  role?: string;
  email?: string;
  avatar?: string;
  joinedAt: string;
  lastActiveAt: string;
  totalMessages: number;
  totalSessions: number;
}

// ─── Tabs ──────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Overview Tab ──────────────────────────────────────────────

function HumanOverviewTab({
  profile,
  participant,
}: {
  profile: HumanProfile | null;
  participant: ParticipantProjection;
}) {
  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-600 text-sm font-bold text-white">
              {participant.displayName?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-(--vestara-text-1)">
                {participant.displayName ?? 'Unknown User'}
              </h3>
              <div className="text-[10px] text-(--vestara-text-muted)">Human Participant</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-3">
          <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
            Presence
          </div>
          <div className="space-y-1">
            <InfoRow label="Status" value={participant.presence} />
            <InfoRow label="Work State" value={participant.workState} />
            <InfoRow label="Membership" value={participant.membership} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-4">
        <div className="flex items-center gap-3">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-600 text-sm font-bold text-white">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-(--vestara-text-1)">{profile.name}</h3>
            {profile.role && (
              <div className="text-[10px] text-(--vestara-text-muted)">{profile.role}</div>
            )}
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-3">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Identity
        </div>
        <div className="space-y-1">
          <InfoRow label="User ID" value={profile.id} />
          {profile.email && <InfoRow label="Email" value={profile.email} />}
          <InfoRow label="Joined" value={new Date(profile.joinedAt).toLocaleDateString()} />
          <InfoRow label="Last Active" value={new Date(profile.lastActiveAt).toLocaleDateString()} />
        </div>
      </div>

      {/* Presence */}
      <div className="rounded-xl border border(--vestara-border) bg-(--vestara-surface) p-3">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Presence
        </div>
        <div className="space-y-1">
          <InfoRow label="Status" value={participant.presence} />
          <InfoRow label="Work State" value={participant.workState} />
          <InfoRow label="Membership" value={participant.membership} />
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-3">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Activity Summary
        </div>
        <div className="space-y-1">
          <InfoRow label="Total Messages" value={String(profile.totalMessages)} />
          <InfoRow label="Total Sessions" value={String(profile.totalSessions)} />
        </div>
      </div>
    </div>
  );
}

// ─── Activity Tab ──────────────────────────────────────────────

function HumanActivityTab({
  participant,
}: {
  participant: ParticipantProjection;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-4">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Projected State
        </div>
        <div className="space-y-1">
          <InfoRow label="Presence" value={participant.presence} />
          <InfoRow label="Work State" value={participant.workState} />
          {participant.currentAssignment && (
            <InfoRow
              label="Current Task"
              value={participant.currentAssignment.taskTitle ?? participant.currentAssignment.taskId}
            />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-(--vestara-border) bg-(--vestara-surface) p-4">
        <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim) mb-2">
          Activity History
        </div>
        <p className="text-[10px] text-(--vestara-text-muted)">
          Activity history will be displayed here when the Activity Room API provides historical data.
        </p>
      </div>
    </div>
  );
}

// ─── Helper Components ─────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-(--vestara-text-muted)">{label}</span>
      <span className="text-(--vestara-text-1) font-medium">{value}</span>
    </div>
  );
}

// ─── Main Human Participant Drawer Component ───────────────────

export function HumanParticipantDrawer({
  open,
  onClose,
  participantId,
  participant,
}: HumanParticipantDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [profile, setProfile] = useState<HumanProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch human profile
  useEffect(() => {
    if (!open || !participantId) return;

    let cancelled = false;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Try to fetch human profile from API
        const res = await fetch(`/api/teams/members/${encodeURIComponent(participantId)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setProfile(data.member ?? null);
          }
        }
      } catch {
        // Profile may not exist — use participant data only
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => { cancelled = true; };
  }, [open, participantId]);

  // Reset tab on open
  useEffect(() => {
    if (open) {
      setActiveTab('overview');
    }
  }, [open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={participant.displayName ?? 'Human Participant'}
      size="md"
    >
      <div className="flex flex-col h-full">
        {/* Tabs */}
        <Tabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
        />

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <HumanOverviewTab profile={profile} participant={participant} />
          )}
          {activeTab === 'activity' && (
            <HumanActivityTab participant={participant} />
          )}
        </div>
      </div>
    </Drawer>
  );
}
