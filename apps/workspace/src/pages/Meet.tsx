/**
 * Vestara Meet — Video Conference Page
 *
 * Fully responsive video conference UI with real OpenVidu media.
 * Uses PageShell for consistent layout, useMediaConference for media.
 *
 * Flow:
 *   1. User sees join screen → enters display name + room name
 *   2. POST /api/media/token → server creates session + returns token
 *   3. useMediaConference → MediaConferenceClient → OpenViduBrowserAdapter
 *   4. Connected → video grid + sidebar + controls
 *
 * Architecture:
 *   MeetPage → PageShell → useMediaConference → MediaConferenceClient → BrowserAdapter → openvidu-browser
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-007 Video Conference UI
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { PageShell, usePageShell } from '../components/layout/Page/PageShell';
import {
  useMediaConference,
  type UseMediaConferenceReturn,
} from '../components/media/useMediaConference';
import { OpenViduBrowserAdapter } from '@vestara/media-conference';
import type { MediaConferenceParticipant } from '@vestara/media-conference';

// ─── Types ───────────────────────────────────────────────────

interface JoinForm {
  displayName: string;
  sessionId: string;
}

// ─── SVG Icons ───────────────────────────────────────────────

function VestaraLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d="M16 2L4 28h8l4-10 4 10h8L16 2z" fill="var(--vestara-accent)" />
      <path d="M16 2L4 28h8l4-10" fill="var(--vestara-accent-dark)" />
    </svg>
  );
}

function IconMic({ muted }: { muted?: boolean }) {
  if (muted) return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22" /><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" /><path d="M5 10v2a7 7 0 0 0 12 5" /><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><line x1="12" x2="12" y1="19" y2="22" /></svg>);
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>);
}

function IconCamera({ off }: { off?: boolean }) {
  if (off) return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22" /><path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16" /></svg>);
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>);
}

function IconPhone() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);
}

function IconScreenShare() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>);
}

function IconGrid() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
}

function IconChat() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
}

function IconSettings() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
}

function IconMore() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>);
}

function IconPlus() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>);
}

function IconVideo() {
  return (<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>);
}

// ─── Participant Tile ────────────────────────────────────────

function MeetParticipantTile({ participant }: { participant: MediaConferenceParticipant }) {
  const initials = participant.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2);
  const hasVideo = participant.videoEnabled && participant.mediaStream;

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl sm:rounded-2xl',
        'bg-(--vestara-surface)',
        participant.local ? 'ring-2 ring-(--vestara-accent)/80' : '',
        'min-h-[140px] sm:min-h-0',
      ].join(' ')}
      data-testid={`meet-tile-${participant.id}`}
    >
      {hasVideo ? (
        <video
          autoPlay
          playsInline
          muted={participant.local}
          className="absolute inset-0 h-full w-full object-cover"
          ref={(el) => {
            if (el && participant.mediaStream) {
              el.srcObject = participant.mediaStream;
              el.play().catch(() => {});
            }
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-(--vestara-surface) to-(--vestara-bg)">
          <div className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-(--vestara-accent)/20 text-xl sm:text-2xl font-semibold text-(--vestara-accent-text)">
            {initials || '?'}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 sm:px-4 pt-6 sm:pt-8 pb-2.5 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-white truncate">
              {participant.displayName}
              {participant.local && <span className="ml-1 text-slate-400">(You)</span>}
            </div>
          </div>
          <div
            className={[
              'flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full',
              participant.audioEnabled
                ? 'bg-(--vestara-accent)/20 text-(--vestara-accent-text)'
                : 'bg-red-500/20 text-red-400',
            ].join(' ')}
          >
            <IconMic muted={!participant.audioEnabled} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────

function MeetSidebar({ media }: { media: UseMediaConferenceReturn }) {
  const [tab, setTab] = useState<'participants' | 'chat'>('participants');
  const participants = media.state.participants;

  return (
    <PageShell.Sidebar width="w-72">
      <div className="flex border-b border-(--vestara-accent-border)">
        <button
          type="button"
          onClick={() => setTab('participants')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
            tab === 'participants'
              ? 'border-b-2 border-(--vestara-accent) text-(--vestara-accent-text)'
              : 'text-(--vestara-text-muted) hover:text-(--vestara-text-2)'
          }`}
        >
          Participants ({participants.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('chat')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
            tab === 'chat'
              ? 'border-b-2 border-(--vestara-accent) text-(--vestara-accent-text)'
              : 'text-(--vestara-text-muted) hover:text-(--vestara-text-2)'
          }`}
        >
          Chat
        </button>
      </div>

      <PageShell.SidebarSection>
        {tab === 'participants' ? (
          <div className="space-y-2">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-(--vestara-accent-bg)">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--vestara-accent)/20 text-sm font-medium text-(--vestara-accent-text)">
                  {p.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-(--vestara-text-2) truncate">
                    {p.displayName}
                    {p.local && <span className="ml-1 text-(--vestara-text-muted)">(You)</span>}
                  </div>
                  <div className="text-xs text-(--vestara-text-muted) capitalize truncate">{p.connectionState}</div>
                </div>
                <div className={p.audioEnabled ? 'text-(--vestara-accent-text)' : 'text-red-400'}>
                  <IconMic muted={!p.audioEnabled} />
                </div>
              </div>
            ))}

            {participants.length === 0 && (
              <div className="text-center text-sm text-(--vestara-text-muted) py-8">
                Waiting for participants...
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-(--vestara-text-muted)">
            No messages yet
          </div>
        )}
      </PageShell.SidebarSection>

      <div className="border-t border-(--vestara-accent-border) p-4">
        <div className="flex items-center gap-2.5 text-(--vestara-text-muted)">
          <VestaraLogo className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-(--vestara-text-2) leading-tight">Building a more human</div>
            <div className="text-xs text-(--vestara-text-2) leading-tight">AI future, together.</div>
            <div className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-(--vestara-text-muted)">VESTARA</div>
          </div>
        </div>
      </div>
    </PageShell.Sidebar>
  );
}

// ─── Join Screen ─────────────────────────────────────────────

function JoinScreen({ onJoin }: { onJoin: (form: JoinForm) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [sessionId, setSessionId] = useState(`meet-${Math.random().toString(36).slice(2, 8)}`);
  const [joining, setJoining] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setJoining(true);
    onJoin({ displayName: displayName.trim(), sessionId: sessionId.trim() || `meet-${Date.now()}` });
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <VestaraLogo className="h-12 w-12" />
          <h1 className="text-xl font-bold text-(--vestara-text)">Vestara Meet</h1>
          <p className="text-sm text-(--vestara-text-muted) text-center">
            Real-time video conference powered by Vestara
          </p>
        </div>

        {/* Join Form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-6">
          <div>
            <label className="block text-xs font-medium text-(--vestara-text-2) mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg border border-(--vestara-accent-border) bg-(--vestara-bg) px-3 py-2.5 text-sm text-(--vestara-text) outline-none focus:border-(--vestara-accent) placeholder:text-(--vestara-text-muted)"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-(--vestara-text-2) mb-1.5">
              Room Name
            </label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Room name (auto-generated if empty)"
              className="w-full rounded-lg border border-(--vestara-accent-border) bg-(--vestara-bg) px-3 py-2.5 text-sm text-(--vestara-text) outline-none focus:border-(--vestara-accent) placeholder:text-(--vestara-text-muted)"
            />
            <p className="mt-1 text-[10px] text-(--vestara-text-muted)">
              Share this name with others to join the same room
            </p>
          </div>

          <button
            type="submit"
            disabled={!displayName.trim() || joining}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-(--vestara-accent) px-4 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {joining ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                Joining...
              </>
            ) : (
              <>
                <IconVideo />
                Join Meeting
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Sidebar Toggle ──────────────────────────────────────────

function SidebarToggleButton() {
  const { toggleSidebar } = usePageShell();
  return (
    <PageShell.Button onClick={toggleSidebar} title="Toggle sidebar">
      <IconChat />
    </PageShell.Button>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function MeetPage() {
  const [joinForm, setJoinForm] = useState<JoinForm | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const media = useMediaConference({
    createAdapter: () => new OpenViduBrowserAdapter(),
  });

  // Join handler — fetches token from API, then connects
  const handleJoin = useCallback(async (form: JoinForm) => {
    setTokenError(null);
    setJoinForm(form);

    try {
      // Fetch ephemeral token from server (credentials never touch browser)
      const res = await fetch('/api/media/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: form.sessionId,
          displayName: form.displayName,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Failed to get token (${res.status})`);
      }

      const { token, sessionId, serverUrl } = await res.json() as {
        token: string;
        sessionId: string;
        serverUrl: string;
      };

      // Connect to media conference
      await media.connect({
        serverUrl,
        sessionId,
        credential: token,
        displayName: form.displayName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join';
      setTokenError(message);
      setJoinForm(null);
    }
  }, [media]);

  // Leave handler
  const handleLeave = useCallback(async () => {
    await media.disconnect();
    setJoinForm(null);
    setMuted(false);
    setVideoOff(false);
  }, [media]);

  // Toggle mic
  const toggleMute = useCallback(async () => {
    await media.toggleMicrophone();
    setMuted((m) => !m);
  }, [media]);

  // Toggle camera
  const toggleVideo = useCallback(async () => {
    await media.toggleCamera();
    setVideoOff((v) => !v);
  }, [media]);

  // Not connected — show join screen
  if (!joinForm || media.state.state === 'idle') {
    return (
      <PageShell>
        <PageShell.Header card>
          <PageShell.Title eyebrow="Vestara Meet" title="Video Conference" />
        </PageShell.Header>
        <PageShell.Content>
          <PageShell.Main>
            {tokenError && (
              <div className="mb-4 rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)">
                {tokenError}
                <button
                  type="button"
                  onClick={() => setTokenError(null)}
                  className="ml-2 underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}
            <JoinScreen onJoin={handleJoin} />
          </PageShell.Main>
        </PageShell.Content>
      </PageShell>
    );
  }

  // Connecting
  if (media.state.state === 'connecting') {
    return (
      <PageShell>
        <PageShell.Header card>
          <PageShell.Title
            eyebrow="Vestara Meet"
            title={joinForm.sessionId}
            subtitle="Connecting..."
          />
        </PageShell.Header>
        <PageShell.Content>
          <PageShell.Main>
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--vestara-accent) border-t-transparent" />
              <div className="text-sm text-(--vestara-text-2)">Connecting to meeting...</div>
              <div className="text-xs text-(--vestara-text-muted)">Room: {joinForm.sessionId}</div>
            </div>
          </PageShell.Main>
        </PageShell.Content>
      </PageShell>
    );
  }

  // Failed
  if (media.state.state === 'failed') {
    return (
      <PageShell>
        <PageShell.Header card>
          <PageShell.Title eyebrow="Vestara Meet" title="Connection Failed" />
        </PageShell.Header>
        <PageShell.Content>
          <PageShell.Main>
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="text-sm text-(--vestara-red)">
                {media.state.error ?? 'Connection failed'}
              </div>
              <button
                type="button"
                onClick={() => { setJoinForm(null); }}
                className="rounded-lg bg-(--vestara-accent) px-4 py-2 text-sm font-medium text-black hover:opacity-90 cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </PageShell.Main>
        </PageShell.Content>
      </PageShell>
    );
  }

  // Connected — full conference UI
  const participants = media.state.participants;
  const participantCount = participants.length;

  return (
    <PageShell>
      {/* ─── Header ────────────────────────────────────── */}
      <PageShell.Header card>
        <PageShell.Title
          eyebrow="Vestara Meet"
          title={joinForm.sessionId}
          subtitle={`${participantCount} participant${participantCount !== 1 ? 's' : ''}`}
        />

        <PageShell.Actions>
          <PageShell.Status
            color="green"
            pulse={media.state.state === 'connected'}
            label={media.state.state === 'connected' ? 'Connected' : media.state.state}
          />

          <PageShell.Button title="Grid view">
            <IconGrid />
          </PageShell.Button>

          <SidebarToggleButton />

          <PageShell.Button title="Settings">
            <IconSettings />
          </PageShell.Button>

          <PageShell.Button variant="danger" onClick={handleLeave} title="Leave meeting">
            <span className="flex items-center gap-1.5">
              <IconPhone />
              Leave
            </span>
          </PageShell.Button>
        </PageShell.Actions>
      </PageShell.Header>

      {/* ─── Content ───────────────────────────────────── */}
      <PageShell.Content>
        <PageShell.Main>
          {participantCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="text-sm text-(--vestara-text-2)">Waiting for participants...</div>
              <div className="text-xs text-(--vestara-text-muted)">Share room "{joinForm.sessionId}" to invite others</div>
            </div>
          ) : (
            <div className="grid h-full grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 auto-rows-fr">
              {participants.map((p) => (
                <MeetParticipantTile key={p.id} participant={p} />
              ))}
            </div>
          )}
        </PageShell.Main>

        <MeetSidebar media={media} />
      </PageShell.Content>

      {/* ─── Footer / Controls ─────────────────────────── */}
      <PageShell.Footer card>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className={[
              'flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer',
              media.state.microphoneEnabled
                ? 'bg-(--vestara-surface) text-(--vestara-text-2) hover:bg-(--vestara-accent-bg)'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
            ].join(' ')}
          >
            <IconMic muted={!media.state.microphoneEnabled} />
            <span className="hidden sm:inline">{media.state.microphoneEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            className={[
              'flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer',
              media.state.cameraEnabled
                ? 'bg-(--vestara-surface) text-(--vestara-text-2) hover:bg-(--vestara-accent-bg)'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
            ].join(' ')}
          >
            <IconCamera off={!media.state.cameraEnabled} />
            <span className="hidden sm:inline">{media.state.cameraEnabled ? 'Stop Video' : 'Start Video'}</span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-(--vestara-surface) px-4 py-2.5 text-sm font-medium text-(--vestara-text-2) transition-colors hover:bg-(--vestara-accent-bg) cursor-pointer"
          >
            <IconScreenShare />
            Share Screen
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-(--vestara-surface) px-4 py-2.5 text-sm font-medium text-(--vestara-text-2) transition-colors hover:bg-(--vestara-accent-bg) cursor-pointer"
          >
            <IconMore />
            More
          </button>
        </div>

        <div className="hidden sm:block">
          <button
            type="button"
            onClick={handleLeave}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 cursor-pointer"
          >
            <IconPhone />
            Leave
          </button>
        </div>

        <div className="flex sm:hidden items-center gap-1.5 text-[10px] text-(--vestara-text-muted)">
          <VestaraLogo className="h-4 w-4" />
          <span>VESTARA</span>
        </div>
      </PageShell.Footer>
    </PageShell>
  );
}
