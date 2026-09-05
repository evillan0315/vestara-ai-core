/**
 * Voice Control panel — the "Audio Browser" mic control surface.
 *
 * Matches the Live Browser right-rail design: listening status, a large
 * circular microphone visual with animated rings, an audio waveform, and a
 * microphone device picker. Captures audio → /api/stt → /api/voice/intent.
 */

import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import MicOffRoundedIcon from '@mui/icons-material/MicOffRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import { useEffect, useState } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { sttTranscribe } from '../../lib/browser-client';

export interface VoiceControlPanelProps {
  disabled: boolean;
  onCommand(text: string): Promise<{ ok: boolean; error?: string; action?: string }>;
}

const WAVEFORM_BARS = [
  { id: 'w1', height: 8 },
  { id: 'w2', height: 14 },
  { id: 'w3', height: 22 },
  { id: 'w4', height: 16 },
  { id: 'w5', height: 28 },
  { id: 'w6', height: 18 },
  { id: 'w7', height: 24 },
  { id: 'w8', height: 12 },
  { id: 'w9', height: 20 },
  { id: 'w10', height: 26 },
  { id: 'w11', height: 14 },
  { id: 'w12', height: 10 },
  { id: 'w13', height: 22 },
  { id: 'w14', height: 16 },
  { id: 'w15', height: 12 },
];

export function VoiceControlPanel({ disabled, onCommand }: VoiceControlPanelProps) {
  const { state, startRecording, stopRecording } = useAudioRecorder();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        const inputs = list.filter((d) => d.kind === 'audioinput');
        setDevices(inputs);
        const preferred = inputs.find((d) => d.deviceId === 'default') ?? inputs[0];
        if (preferred) setDeviceId(preferred.deviceId);
      })
      .catch(() => {});
  }, []);

  const runCommand = async (text: string) => {
    setBusy(true);
    setStatusLine('Executing…');
    const result = await onCommand(text);
    setStatusLine(result.ok ? `✓ ${result.action ?? 'done'}` : (result.error ?? 'Failed'));
    setBusy(false);
  };

  const handleMicClick = async () => {
    if (state.recording) {
      const blob = await stopRecording();
      if (!blob) return;
      setBusy(true);
      setStatusLine('Transcribing…');
      const stt = await sttTranscribe(blob);
      const text = stt.text.trim();
      if (!text) {
        setStatusLine(stt.error ?? 'Could not transcribe audio — try the command box');
        setBusy(false);
        return;
      }
      await runCommand(text);
      setBusy(false);
      return;
    }
    setStatusLine(null);
    await startRecording(deviceId || undefined);
  };

  const listening = state.recording;
  const micDisabled = disabled || busy || !state.supported;
  const activeDevice = devices.find((d) => d.deviceId === deviceId);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-(--vestara-accent-border) bg-zinc-900 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraphicEqRoundedIcon fontSize="small" className="text-(--vestara-accent-text)" />
          <h2 className="text-sm font-semibold text-(--vestara-text)">Voice Control</h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            listening
              ? 'bg-(--vestara-green)/10 text-(--vestara-green)'
              : busy
                ? 'bg-(--vestara-accent-bg) text-(--vestara-accent-text)'
                : 'bg-zinc-800 text-(--vestara-text-muted)'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${listening ? 'bg-(--vestara-green) animate-pulse' : busy ? 'bg-(--vestara-accent-text)' : 'bg-(--vestara-text-dim)'}`}
          />
          {listening ? 'Listening' : busy ? 'Working…' : 'Idle'}
        </span>
      </div>

      {/* Circular microphone visual */}
      <div className="relative flex flex-col items-center gap-3 py-2">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {/* Animated rings */}
          <span
            className={`absolute inset-0 rounded-full border border-(--vestara-green)/30 ${listening ? 'animate-ping' : ''}`}
            style={{ animationDuration: '2.5s' }}
          />
          <span className="absolute inset-2 rounded-full border border-(--vestara-green)/20" />
          <span className="absolute inset-4 rounded-full border border-(--vestara-green)/10" />
          {/* Mic disc */}
          <div
            className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full ${
              listening
                ? 'bg-(--vestara-green)/15 text-(--vestara-green) shadow-[0_0_24px_rgba(74,222,128,0.4)]'
                : 'bg-zinc-800 text-(--vestara-text-muted)'
            }`}
          >
            {listening ? <MicRoundedIcon /> : <MicOffRoundedIcon />}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleMicClick()}
          disabled={micDisabled}
          className={`text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            listening ? 'text-(--vestara-green)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
          }`}
        >
          {listening ? 'Click to stop listening' : 'Click to start listening'}
        </button>

        {/* Audio waveform */}
        <div className="flex h-6 items-end gap-[3px]">
          {WAVEFORM_BARS.map(({ id, height }) => (
            <span
              key={id}
              className={`w-[3px] rounded-full ${listening ? 'bg-(--vestara-green)' : 'bg-zinc-700'}`}
              style={{
                height: `${height}px`,
                animation: listening
                  ? `vestaraWave 0.9s ease-in-out ${(Number(id.slice(1)) - 1) * 0.06}s infinite alternate`
                  : 'none',
              }}
            />
          ))}
        </div>
        {statusLine && <p className="text-[11px] text-(--vestara-text-muted)">{statusLine}</p>}
      </div>

      {/* Microphone device picker */}
      <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5">
        <MicRoundedIcon fontSize="small" className="shrink-0 text-(--vestara-text-dim)" />
        <label htmlFor="mic-select" className="min-w-0 flex-1 truncate text-xs text-(--vestara-text-2)">
          {activeDevice?.label || 'Default Microphone'}
        </label>
        {devices.length > 0 && (
          <select
            id="mic-select"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            disabled={listening || busy}
            aria-label="Microphone"
            className="min-w-0 max-w-[40%] bg-transparent text-xs text-(--vestara-text-2) outline-none disabled:opacity-40"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Microphone'}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
