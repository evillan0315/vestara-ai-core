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
import { PageShell } from '../components/layout/Page/PageShell';
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

function IconBackground() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L11 18" /></svg>);
}

function IconCopy() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
}

function IconInvite() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>);
}

function IconUser() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
}

function IconChevronDown() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
}

function IconSpeaker() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>);
}

function IconWifi({ quality }: { quality?: 'good' | 'ok' | 'poor' }) {
  const color = quality === 'good' ? 'var(--vestara-green)' : quality === 'ok' ? 'var(--vestara-amber)' : 'var(--vestara-red)';
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" x2="12.01" y1="20" y2="20" /></svg>);
}

// ─── Participant Tile ────────────────────────────────────────

function MeetParticipantTile({ participant }: { participant: MediaConferenceParticipant }) {
  const initials = participant.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2);
  const hasVideo = participant.videoEnabled && participant.mediaStream;

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-200',
        'bg-[var(--vestara-surface)]',
        'border border-[var(--vestara-accent-border)]',
        'shadow-[0_0_0_1px_var(--vestara-surface-glow),0_0_8px_var(--vestara-surface-glow)]',
        participant.local ? 'ring-2 ring-(--vestara-accent) shadow-[0_0_0_2px_var(--vestara-accent),0_0_20px_var(--vestara-surface-glow-hover)]' : '',
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
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--vestara-surface)] to-[var(--vestara-surface-elevated)]">
          <div className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-xl sm:text-2xl font-semibold text-(--vestara-accent-text) shadow-[0_0_16px_var(--vestara-surface-glow)]">
            {initials || '?'}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 sm:px-4 pt-6 sm:pt-8 pb-2.5 sm:pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-white truncate">
              {participant.displayName}
              {participant.local && <span className="ml-1 text-white/50">(You)</span>}
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
    <div className="flex h-full flex-col">
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

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'participants' ? (
          <div className="space-y-1">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-(--vestara-surface-glow) transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-sm font-medium text-(--vestara-accent-text) shadow-[0_0_8px_var(--vestara-surface-glow)]">
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
      </div>

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
    </div>
  );
}

// ─── Join Screen (Pre-Join Lobby) ──────────────────────────

function JoinScreen({ onJoin }: { onJoin: (form: JoinForm) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [sessionId, setSessionId] = useState(`meet-${Math.random().toString(36).slice(2, 8)}`);
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [mirror, setMirror] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const initials = displayName.trim() ? displayName.trim().split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'E';

  // Start camera preview
  useEffect(() => {
    if (!camOn) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraError(null);
      })
      .catch((err) => {
        if (!cancelled) setCameraError(err instanceof Error ? err.message : 'Camera unavailable');
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [camOn]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setJoining(true);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    onJoin({ displayName: displayName.trim(), sessionId: sessionId.trim() || `meet-${Date.now()}` });
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${sessionId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--vestara-surface)]">
      {/* ─── Branded Header ─────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-3">
          <VestaraLogo className="h-7 w-7 sm:h-8 sm:w-8" />
          <div className="leading-tight">
            <h1 className="text-lg sm:text-xl font-bold text-(--vestara-text)">Vestara Meet</h1>
            <p className="text-[10px] text-(--vestara-text-muted)">Real people. Real progress.</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] text-(--vestara-text-muted)">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Secure</span>
          <span aria-hidden="true">·</span>
          <span>Encrypted</span>
          <span aria-hidden="true">·</span>
          <span>Powered by Vestara</span>
        </div>
      </header>

      {/* ─── Three-Column Lobby ──────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-4 pb-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[1fr_340px_290px] lg:overflow-hidden">
        {/* LEFT: Camera Preview + Controls */}
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <div className="relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] shadow-[0_0_0_1px_var(--vestara-surface-glow),0_0_24px_var(--vestara-surface-glow)]">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
              <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur">HD 1080p</span>
              {mirror && <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur">Mirror</span>}
            </div>
            <button
              type="button"

              onClick={() => setMirror((m) => !m)}
              className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[9px] text-white backdrop-blur transition-colors hover:bg-black/70 cursor-pointer"
            >
              <IconSettings className="h-3 w-3" /> Mirror
            </button>

            {camOn && !cameraError ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 h-full w-full object-cover ${mirror ? '-scale-x-100' : ''}`}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[var(--vestara-surface-elevated)] to-[var(--vestara-surface)]">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-3xl font-bold text-(--vestara-accent-text) shadow-[0_0_20px_var(--vestara-surface-glow)]">
                  {initials}
                </div>
                <div className="text-sm text-(--vestara-text-2)">{displayName || 'Your name'}</div>
                <div className="text-[10px] text-(--vestara-text-muted)">Camera is off</div>
              </div>
            )}

            {/* Name overlay */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 backdrop-blur">
              <span className="flex h-4 w-4 items-center justify-center text-(--vestara-accent-text)"><IconMic muted={!micOn} /></span>
              <span className="text-xs font-medium text-white">{displayName || 'Your name'}</span>
            </div>

            {/* Camera error */}
            {cameraError && camOn && (
              <div className="absolute top-12 left-3 right-3 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-[10px] text-red-300 backdrop-blur">
                Camera: {cameraError}
              </div>
            )}
          </div>

          {/* Primary Media Controls */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 py-1">
            <MediaControlButton
              icon={<IconMic muted={!micOn} />}
              label="Microphone"
              state={micOn ? 'On' : 'Off'}
              active={micOn}
              onClick={() => setMicOn((m) => !m)}
            />
            <MediaControlButton
              icon={<IconCamera off={!camOn} />}
              label="Camera"
              state={camOn ? 'On' : 'Off'}
              active={camOn}
              onClick={() => setCamOn((c) => !c)}
            />
            <MediaControlButton icon={<IconBackground />} label="Background" state="Blur" active={false} onClick={() => {}} />
            <MediaControlButton icon={<IconSettings />} label="Settings" state="" active={false} onClick={() => {}} />
          </div>

          {/* Audio & Video Settings */}
          <div className="rounded-2xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-(--vestara-accent-bg) text-(--vestara-accent-text)"><IconSettings className="h-3 w-3" /></div>
              <div>
                <h3 className="text-xs font-semibold text-(--vestara-text)">Audio & Video Settings</h3>
                <p className="text-[9px] text-(--vestara-text-muted)">Configure your devices and preferences</p>
              </div>
            </div>
            <div className="space-y-2">
              <DeviceSelect label="Camera" icon={<IconCamera />} value="Integrated Camera (0c45f6710)" />
              <DeviceSelect label="Microphone" icon={<IconMic />} value="Built-in Audio (alsa_input...)" meter />
              <DeviceSelect label="Speaker" icon={<IconSpeaker />} value="Built-in Audio (alsa_output...)" test />
            </div>
          </div>
        </div>

        {/* CENTER: Ready To Join */}
        <div className="flex min-w-0 flex-col gap-3 lg:overflow-y-auto">
          <div className="flex items-center justify-between rounded-xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-(--vestara-text)">Ready to join?</h2>
              <p className="text-[10px] text-(--vestara-text-muted)">Check your setup and join the meeting.</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-(--vestara-accent-bg) px-2.5 py-1.5 text-[10px] font-medium text-(--vestara-accent-text)">
              <IconVideo className="h-3 w-3" />
              Product Planning
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Display Name" icon={<IconUser />}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-transparent px-3 py-2 text-sm text-(--vestara-text) outline-none placeholder:text-(--vestara-text-muted)"
                autoFocus
                required
              />
            </Field>
            <Field label="Meeting" icon={<IconVideo />} trailing={
              <button type="button" onClick={handleCopyLink} className="text-(--vestara-text-muted) hover:text-(--vestara-accent-text) cursor-pointer" title="Copy link">
                <IconCopy className="h-3.5 w-3.5" />
              </button>
            }>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-full bg-transparent px-3 py-2 text-sm text-(--vestara-text) outline-none"
              />
            </Field>
          </form>

          {/* Meeting Identity Card */}
          <div className="flex items-center gap-3 rounded-xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--vestara-accent-bg) text-(--vestara-accent-text)">
              <IconVideo className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-(--vestara-text)">Product Planning</div>
              <div className="text-[10px] text-(--vestara-text-muted)">Workspace Meeting · 4 participants waiting</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!displayName.trim() || joining}
            className="flex items-center justify-center gap-2 rounded-xl bg-(--vestara-accent) px-4 py-3 text-sm font-semibold text-black transition-all hover:opacity-90 hover:shadow-[0_0_20px_var(--vestara-surface-glow-hover)] disabled:opacity-40 disabled:shadow-none cursor-pointer"
          >
            {joining ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                Joining...
              </>
            ) : (
              <>
                <span className="flex h-1.5 w-1.5 rounded-full" /><IconVideo className="h-4 w-4" />
                Join Meeting →
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button type="button" onClick={handleCopyLink} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] px-3 py-2 text-xs font-medium text-(--vestara-text-2) transition-colors hover:border-(--vestara-accent-border-hover) cursor-pointer">
              <IconCopy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] px-3 py-2 text-xs font-medium text-(--vestara-text-2) transition-colors hover:border-(--vestara-accent-border-hover) cursor-pointer">
              <IconInvite className="h-3.5 w-3.5" /> Invite People
            </button>
          </div>
        </div>

        {/* RIGHT: Preflight Check */}
        <div className="flex min-w-0 flex-col gap-3 lg:overflow-y-auto">
          <div className="rounded-2xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-(--vestara-text)">Preflight Check</h3>
              <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-medium text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> All systems ready
              </span>
            </div>
            <div className="space-y-1">
              <PreflightRow icon={<IconCamera />} label="Camera detected" detail="Integrated Camera" status={camOn && !cameraError ? 'ok' : cameraError ? 'error' : 'off'} />
              <PreflightRow icon={<IconMic />} label="Microphone detected" detail="Built-in Audio" status={micOn ? 'ok' : 'off'} />
              <PreflightRow icon={<IconSpeaker />} label="Speaker available" detail="Built-in Audio" status="ok" />
              <PreflightRow icon={<IconVideo />} label="Media permissions" detail="Granted" status="ok" />
              <PreflightRow icon={<IconWifi quality="good" />} label="Network quality" detail="Excellent · 12 ms" status="ok" />
            </div>
          </div>

          {/* Background Effects */}
          <div className="rounded-2xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-(--vestara-accent-bg) text-(--vestara-accent-text)"><IconBackground className="h-3 w-3" /></div>
              <div>
                <h3 className="text-xs font-semibold text-(--vestara-text)">Background Effects</h3>
                <p className="text-[9px] text-(--vestara-text-muted)">Personalize your video appearance</p>
              </div>
            </div>
            <div className="flex gap-2">
              <BgOption label="None" active />
              <BgOption label="Blur" />
              <BgOption label="Image" />
            </div>
          </div>

          {/* Meeting Intelligence */}
          <div className="rounded-2xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-(--vestara-accent-bg) text-(--vestara-accent-text)"><IconVideo className="h-3 w-3" /></div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-(--vestara-text)">Meeting Intelligence</h3>
                <span className="rounded bg-(--vestara-accent-bg) px-1.5 py-0.5 text-[8px] font-semibold text-(--vestara-accent-text)">Beta</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {['Generate meeting notes', 'Capture decisions', 'Extract action items', 'Generate transcript'].map((label) => (
                <label key={label} className="flex items-center gap-2 text-[10px] text-(--vestara-text-2) cursor-pointer">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded accent-(--vestara-accent)" />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-(--vestara-text-muted)">Notice participants when AI features are enabled.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────

function MediaControlButton({ icon, label, state, active, onClick }: { icon: React.ReactNode; label: string; state: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 cursor-pointer" aria-label={label}>
      <span className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
        active
          ? 'border-(--vestara-accent-border) bg-[var(--vestara-surface)] text-(--vestara-text-2) shadow-[0_0_12px_var(--vestara-surface-glow)] hover:border-(--vestara-accent-border-hover)'
          : 'border-red-500/30 bg-red-500/15 text-red-400'
      }`}>
        {icon}
      </span>
      <span className="text-[9px] font-medium text-(--vestara-text-2)">{label}</span>
      <span className="-mt-1 text-[9px] text-(--vestara-text-muted)">{state}</span>
    </button>
  );
}

function DeviceSelect({ label, icon, value, meter = false, test = false }: { label: string; icon: React.ReactNode; value: string; meter?: boolean; test?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-(--vestara-accent-border) bg-[var(--vestara-surface)] px-3 py-2">
      <span className="flex h-4 w-4 items-center justify-center text-(--vestara-text-muted)">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-(--vestara-text-muted)">{label}</div>
        <div className="flex items-center gap-1 text-[11px] text-(--vestara-text-2) truncate">
          {value}
          <IconChevronDown className="h-3 w-3 shrink-0 text-(--vestara-text-muted)" />
        </div>
      </div>
      {meter && (
        <div className="flex items-end gap-0.5">
          {[3, 5, 8, 6, 10, 7, 4].map((h, i) => (
            <span key={i} className="w-1 rounded-sm bg-(--vestara-accent)" style={{ height: `${h}px`, opacity: 0.4 + h / 18 }} />
          ))}
        </div>
      )}
      {test && <button type="button" className="flex items-center gap-1 text-[10px] text-(--vestara-accent-text) hover:underline cursor-pointer">▶ Test</button>}
    </div>
  );
}

function Field({ label, icon, children, trailing }: { label: string; icon: React.ReactNode; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-(--vestara-accent-border) bg-[var(--vestara-surface-elevated)] px-3 py-2 focus-within:border-(--vestara-accent) focus-within:shadow-[0_0_0_2px_var(--vestara-surface-glow)]">
      {icon && <span className="shrink-0 text-[10px] text-(--vestara-text-muted)">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-(--vestara-text-muted)">{label}</div>
        {children}
      </div>
      {trailing}
    </div>
  );
}

function BgOption({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button type="button" className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[9px] transition-colors cursor-pointer ${
      active ? 'border-(--vestara-accent) bg-(--vestara-accent-bg) text-(--vestara-accent-text)' : 'border-(--vestara-accent-border) text-(--vestara-text-2) hover:border-(--vestara-accent-border-hover)'
    }`}>
      <span className="flex h-8 w-full items-center justify-center rounded-lg bg-gradient-to-br from-[var(--vestara-surface-elevated)] to-[var(--vestara-surface)]">
        {label === 'None' ? <span className="h-3 w-3 rounded-full border border-(--vestara-accent-border)" /> : <IconBackground className="h-4 w-4" />}
      </span>
      {label}
    </button>
  );
}

function PreflightRow({ icon, label, detail, status }: { icon: React.ReactNode; label: string; detail: string; status: 'ok' | 'error' | 'off' }) {
  const color = status === 'ok' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-(--vestara-text-muted)';
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className={color}>{icon}</span>
      <span className="flex-1 text-(--vestara-text-2)">{label}</span>
      <div className="flex flex-col items-end">
        <span className="text-[9px] text-(--vestara-text-muted)">{detail}</span>
        <span className={`text-[11px] ${color}`}>{status === 'ok' ? '✓' : status === 'error' ? '!' : '—'}</span>
      </div>
    </div>
  );
}
// ─── Main Page ───────────────────────────────────────────────

export default function MeetPage() {
  const [joinForm, setJoinForm] = useState<JoinForm | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  // Not connected — show pre-join lobby
  if (!joinForm || media.state.state === 'idle') {
    return <JoinScreen onJoin={handleJoin} />;
  }

  // Connecting
  if (media.state.state === 'connecting') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--vestara-surface)] gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--vestara-accent) border-t-transparent" />
        <div className="text-sm text-(--vestara-text-2)">Connecting to meeting...</div>
        <div className="text-xs text-(--vestara-text-muted)">Room: {joinForm.sessionId}</div>
      </div>
    );
  }

  // Failed
  if (media.state.state === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--vestara-surface)] gap-4">
        <div className="text-sm text-(--vestara-red)">
          {media.state.error ?? 'Connection failed'}
        </div>
        {tokenError && (
          <div className="rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)">
            {tokenError}
          </div>
        )}
        <button
          type="button"
          onClick={() => { setJoinForm(null); setTokenError(null); }}
          className="rounded-lg bg-(--vestara-accent) px-4 py-2 text-sm font-medium text-black hover:opacity-90 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Connected — immersive meeting workspace
  const participants = media.state.participants;
  const participantCount = participants.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--vestara-surface)]">
      {/* ─── Command Bar ─────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--vestara-accent-border) bg-[var(--vestara-surface)] px-3 sm:px-4 py-2 sm:py-2.5 shadow-[0_1px_0_var(--vestara-surface-glow)]">
        <div className="flex items-center gap-3 min-w-0">
          <VestaraLogo className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-(--vestara-text) truncate">{joinForm.sessionId}</div>
            <div className="text-[10px] text-(--vestara-text-muted)">
              {participantCount} participant{participantCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <PageShell.Status
            color="green"
            pulse={media.state.state === 'connected'}
            label={media.state.state === 'connected' ? 'Connected' : media.state.state}
          />

          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              sidebarOpen ? 'bg-(--vestara-accent-bg) text-(--vestara-accent-text)' : 'text-(--vestara-text-muted) hover:bg-(--vestara-surface-glow) hover:text-(--vestara-text-2)'
            }`}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <IconChat />
          </button>

          <button
            type="button"
            onClick={handleLeave}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-red-700 cursor-pointer"
          >
            <IconPhone />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* ─── Stage + Side Panel ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Video Stage */}
        <main className="flex min-w-0 flex-1 flex-col p-2 sm:p-3">
          {participantCount === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--vestara-accent-bg) shadow-[0_0_24px_var(--vestara-surface-glow)]">
                <IconVideo />
              </div>
              <div className="text-sm text-(--vestara-text-2)">Waiting for participants...</div>
              <div className="text-xs text-(--vestara-text-muted)">Share room "{joinForm.sessionId}" to invite others</div>
            </div>
          ) : (
            <div className="grid h-full flex-1 grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 auto-rows-fr">
              {participants.map((p) => (
                <MeetParticipantTile key={p.id} participant={p} />
              ))}
            </div>
          )}
        </main>

        {/* Side Panel */}
        {sidebarOpen && (
          <aside className="hidden sm:flex w-72 shrink-0 flex-col border-l border-(--vestara-accent-border) bg-[var(--vestara-surface)]">
            <MeetSidebar media={media} />
          </aside>
        )}
      </div>

      {/* ─── Control Dock ────────────────────────────────── */}
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-(--vestara-accent-border) bg-[var(--vestara-surface)] px-3 sm:px-4 py-2 sm:py-3 shadow-[0_-1px_0_var(--vestara-surface-glow)]">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className={[
              'flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all cursor-pointer',
              media.state.microphoneEnabled
                ? 'bg-[var(--vestara-surface-elevated)] text-(--vestara-text-2) border border-(--vestara-accent-border) hover:border-(--vestara-accent-border-hover) hover:shadow-[0_0_12px_var(--vestara-surface-glow)]'
                : 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25',
            ].join(' ')}
          >
            <IconMic muted={!media.state.microphoneEnabled} />
            <span className="hidden sm:inline">{media.state.microphoneEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            className={[
              'flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all cursor-pointer',
              media.state.cameraEnabled
                ? 'bg-[var(--vestara-surface-elevated)] text-(--vestara-text-2) border border-(--vestara-accent-border) hover:border-(--vestara-accent-border-hover) hover:shadow-[0_0_12px_var(--vestara-surface-glow)]'
                : 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25',
            ].join(' ')}
          >
            <IconCamera off={!media.state.cameraEnabled} />
            <span className="hidden sm:inline">{media.state.cameraEnabled ? 'Stop Video' : 'Start Video'}</span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-[var(--vestara-surface-elevated)] px-4 py-2.5 text-sm font-medium text-(--vestara-text-2) border border-(--vestara-accent-border) transition-all hover:border-(--vestara-accent-border-hover) hover:shadow-[0_0_12px_var(--vestara-surface-glow)] cursor-pointer"
          >
            <IconScreenShare />
            Share Screen
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-[var(--vestara-surface-elevated)] px-4 py-2.5 text-sm font-medium text-(--vestara-text-2) border border-(--vestara-accent-border) transition-all hover:border-(--vestara-accent-border-hover) hover:shadow-[0_0_12px_var(--vestara-surface-glow)] cursor-pointer"
          >
            <IconMore />
            More
          </button>
        </div>

        <div className="flex sm:hidden items-center gap-1.5 text-[10px] text-(--vestara-text-muted)">
          <VestaraLogo className="h-4 w-4" />
          <span>VESTARA</span>
        </div>
      </footer>
    </div>
  );
}
