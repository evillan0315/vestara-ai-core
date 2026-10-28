import { Activity, Download, Globe, Headphones, Mic, Play, Radio, Volume2, Waves, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createAssistantConversation, streamAssistantMessage } from '../lib/assistant-api';
import { readAssistantToken } from '../lib/auth';
import { capturePcm, type PcmCapture } from '../lib/pcm-capture';
import { playServerAudio, synthesizeServerSpeech, transcribeServerAudio } from '../lib/server-voice';
import {
  listSystemVoices,
  openMicrophone,
  pickSystemVoice,
  type SpeakHandle,
  type SpeechResult,
  speakText,
  startRecognition,
  stopSpeaking,
  voiceEngineSupport,
} from '../lib/voice-engine';
import { fetchVoiceEngines, fetchVoiceModels, type ServerTtsVoice, type VoiceProviderModel } from '../lib/voice-models';
import { openVoiceSocket, type VoiceSocket } from '../lib/voice-socket';
import {
  AUDIO_PIPELINE,
  CLINICAL_INTEGRATIONS,
  DEFAULT_DUPLEX_MODEL_ID,
  DEFAULT_LANGUAGE,
  DEFAULT_STT_MODEL_ID,
  DEFAULT_STT_SOURCE,
  DEFAULT_TTS_SOURCE,
  DEFAULT_TTS_TEXT,
  DEFAULT_TTS_VOICE_ID,
  PREFERRED_DUPLEX_MODEL,
  SERVER_TTS_TEXT_CAP,
  STREAM_PHRASES,
  STT_MODELS,
  type SttModelDef,
  TTS_VOICES,
  type TtsVoiceDef,
  VOICE_COMPLIANCE_NOTE,
  VOICE_EMPTY_TRANSCRIPT,
  VOICE_FOOTER_STATS,
  VOICE_PROVIDERS,
  VOICE_STREAMING_MODES,
  VOICE_STREAMING_SUBTITLE,
  VOICE_STREAMING_TITLE,
  VOICE_STT_SOURCES,
  VOICE_TTS_SOURCES,
  type VoiceProviderDef,
  type VoiceStreamMode,
  type VoiceSttSource,
  type VoiceTtsSource,
} from './voice-streaming.fixtures';

type VoiceCatalogState = 'loading' | 'live' | 'fixture';

function toSttDef(m: VoiceProviderModel): SttModelDef {
  return {
    id: m.modelId,
    name: m.modelName,
    provider: m.providerId,
    family: m.family,
    latency: 'live',
    langs: 0,
    accuracy: 0,
    live: true,
  };
}

function toTtsDef(m: VoiceProviderModel): TtsVoiceDef {
  return {
    id: m.modelId,
    name: m.modelName,
    provider: m.providerId,
    lang: m.family || 'audio',
    gender: '',
    kind: m.family || m.providerId,
    live: true,
  };
}

interface TranscriptRow {
  id: number;
  speaker: 'user' | 'assistant';
  text: string;
  interim: boolean;
  time: string;
  confidence: number;
}

function resolveShellToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function nowTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

export function VoiceStreamingPkg() {
  const [mode, setMode] = useState<VoiceStreamMode>('stt');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const [ttsText, setTtsText] = useState(DEFAULT_TTS_TEXT);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_TTS_VOICE_ID);
  const [selectedSTTModel, setSelectedSTTModel] = useState(DEFAULT_STT_MODEL_ID);
  const [language] = useState(DEFAULT_LANGUAGE);
  const [volume, setVolume] = useState(85);
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [streamLatency, setStreamLatency] = useState(145);
  const [sttModels, setSttModels] = useState<readonly SttModelDef[]>(STT_MODELS);
  const [ttsVoices, setTtsVoices] = useState<readonly TtsVoiceDef[]>(TTS_VOICES);
  const [voiceProviders, setVoiceProviders] = useState<readonly VoiceProviderDef[]>(VOICE_PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [duplexModelId, setDuplexModelId] = useState(DEFAULT_DUPLEX_MODEL_ID);
  const [voiceState, setVoiceState] = useState<VoiceCatalogState>('loading');
  // Browser voice engine: live Web APIs when available, simulation otherwise.
  const [support] = useState(voiceEngineSupport);
  const [sttEngine, setSttEngine] = useState<'live' | 'simulated'>(support.speechRecognition ? 'live' : 'simulated');
  const [ttsEngine] = useState<'live' | 'simulated'>(support.speechSynthesis ? 'live' : 'simulated');
  const [micLive, setMicLive] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [systemVoiceCount, setSystemVoiceCount] = useState(0);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoice, setSelectedSystemVoice] = useState('');
  const [speakProgress, setSpeakProgress] = useState(0);
  // Voice engine selection: whisper/server ride the API (batch POST
  // /api/stt + /api/tts); browser/system use Web APIs; opencode routes
  // through the audio-capable OpenCode catalog + duplex loop.
  const [sttSource, setSttSource] = useState<VoiceSttSource>(DEFAULT_STT_SOURCE);
  const [ttsSource, setTtsSource] = useState<VoiceTtsSource>(DEFAULT_TTS_SOURCE);
  const [serverSttAvailable, setServerSttAvailable] = useState(false);
  const [serverSttDetail, setServerSttDetail] = useState('Checking server…');
  const [serverTtsAvailable, setServerTtsAvailable] = useState(false);
  const [serverTtsDetail, setServerTtsDetail] = useState('Checking server…');
  const [serverTtsVoices, setServerTtsVoices] = useState<readonly ServerTtsVoice[]>([]);
  const [selectedServerVoice, setSelectedServerVoice] = useState('');
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef(0);
  const rowIdRef = useRef(0);
  const interimIdRef = useRef<number | null>(null);
  const micRef = useRef<{ analyser: AnalyserNode; data: Uint8Array; close: () => void } | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const speakHandleRef = useRef<SpeakHandle | null>(null);
  const speakTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<{ socket: VoiceSocket; capture: PcmCapture } | null>(null);
  const serverAudioRef = useRef<{ url: string; revoke: () => void; handle: { stop: () => void } } | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const modeRef = useRef<VoiceStreamMode>('stt');
  modeRef.current = mode;
  const duplexTurnRef = useRef(false);
  const duplexAbortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<string | null>(null);

  // Waveform visualization — live mic FFT when the microphone is open,
  // simulated motion otherwise. Colors resolve from shell tokens at runtime
  // so no literal color values live in TSX (UI/UX governance §3).
  useEffect(() => {
    if (!canvasRef.current || !isRecording) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const surface = resolveShellToken('--vestara-surface-shell-raised', 'black');
    const accent = resolveShellToken('--vestara-accent-shell', 'teal');
    const violet = resolveShellToken('--vestara-accent-theme-violet', 'violet');
    const stroke = mode === 'stt' ? accent : violet;
    let raf = 0;
    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const mic = micRef.current;
      if (mic) {
        mic.analyser.getByteFrequencyData(mic.data);
        for (let x = 0; x < canvas.width; x++) {
          const bin = mic.data[Math.floor((x / canvas.width) * mic.data.length)] ?? 0;
          const y = canvas.height / 2 - (bin / 255) * (canvas.height / 2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height / 2 + Math.sin(x / 10 + Date.now() / 100) * (15 + Math.random() * 10);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.shadowColor = stroke;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    draw();
    animationRef.current = raf;
    return () => cancelAnimationFrame(raf);
    // NOTE: micRef is read inside the frame loop, so a mic that opens
    // mid-recording is picked up without re-running this effect.
  }, [isRecording, mode]);

  // Live OpenCode audio catalog first, fixtures as offline fallback —
  // same API-first pattern as the providers and marketplace packages.
  useEffect(() => {
    let cancelled = false;
    fetchVoiceModels()
      .then((catalog) => {
        if (cancelled) return;
        if (catalog.stt.length > 0 || catalog.tts.length > 0) {
          if (catalog.stt.length > 0) {
            const live = catalog.stt.map(toSttDef);
            setSttModels(live);
            setSelectedSTTModel((prev) => (live.some((m) => m.id === prev) ? prev : live[0].id));
          }
          if (catalog.tts.length > 0) {
            const live = catalog.tts.map(toTtsDef);
            setTtsVoices(live);
            setSelectedVoice((prev) => (live.some((v) => v.id === prev) ? prev : live[0].id));
          }
          const preferred =
            [...catalog.stt, ...catalog.tts].find(
              (m) => m.providerId === PREFERRED_DUPLEX_MODEL.providerId && m.modelId === PREFERRED_DUPLEX_MODEL.modelId,
            ) ?? catalog.duplex;
          if (preferred) setDuplexModelId(`${preferred.providerId}/${preferred.modelId}`);
          if (catalog.providers.length > 0) {
            const liveProviders = catalog.providers.map(({ id, name }) => ({ id, name }));
            setVoiceProviders(liveProviders);
            setSelectedProvider((prev) => (prev === 'all' || liveProviders.some((p) => p.id === prev) ? prev : 'all'));
          }
          setVoiceState('live');
        } else {
          setVoiceState('fixture');
        }
      })
      .catch(() => {
        if (!cancelled) setVoiceState('fixture');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Count system TTS voices once so the status rail reports the live engine.
  useEffect(() => {
    if (!support.speechSynthesis) return;
    let cancelled = false;
    void listSystemVoices().then((voices) => {
      if (cancelled) return;
      setSystemVoiceCount(voices.length);
      setSystemVoices(voices);
    });
    return () => {
      cancelled = true;
    };
  }, [support.speechSynthesis]);

  // Server voice engines (Whisper/Piper availability + Piper voices) — same
  // API-first pattern as the model catalog; unavailable stays selectable
  // only where a client fallback exists, otherwise disabled with the reason.
  useEffect(() => {
    let cancelled = false;
    fetchVoiceEngines()
      .then((engines) => {
        if (cancelled) return;
        const whisper = engines.sttEngines.find((e) => e.id === 'whisper');
        const server = engines.ttsEngines.find((e) => e.id === 'server');
        setServerSttAvailable(whisper?.available === true);
        setServerSttDetail(whisper?.detail || 'Whisper status unknown');
        setServerTtsAvailable(server?.available === true);
        setServerTtsDetail(server?.detail || 'Piper status unknown');
        if (engines.ttsVoices.length > 0) {
          setServerTtsVoices(engines.ttsVoices);
          setSelectedServerVoice((prev) =>
            engines.ttsVoices.some((v) => v.id === prev) ? prev : engines.ttsVoices[0].id,
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setServerSttAvailable(false);
        setServerSttDetail('Server unreachable — Whisper engine unavailable');
        setServerTtsAvailable(false);
        setServerTtsDetail('Server unreachable — Piper engine unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stable identity (refs + setState only) so the unmount effect and
  // stopLiveCapture share it without re-running effects per render.
  const stopVoiceSocket = useCallback(() => {
    const live = wsRef.current;
    wsRef.current = null;
    if (!live) return;
    live.capture.close();
    micRef.current?.close();
    micRef.current = null;
    try {
      live.socket.stop();
    } catch {
      // Socket already gone — close() below still releases it.
    }
    // Await the server's trailing utterance, then release — bounded so a
    // dead socket never hangs Stop (or unmount).
    void Promise.race([live.socket.stopped, new Promise((resolve) => setTimeout(resolve, 3000))])
      .catch(() => {})
      .then(() => live.socket.close());
    setMicLive(false);
  }, []);

  // Release mic / recognition / recorder / socket / server audio / speech on unmount.
  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      recorderRef.current = null;
      stopVoiceSocket();
      micRef.current?.close();
      micRef.current = null;
      duplexAbortRef.current?.abort();
      duplexAbortRef.current = null;
      serverAudioRef.current?.handle.stop();
      serverAudioRef.current?.revoke();
      serverAudioRef.current = null;
      stopSpeaking();
      if (speakTimerRef.current !== null) window.clearTimeout(speakTimerRef.current);
      if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    },
    [stopVoiceSocket],
  );

  const stopLiveCapture = () => {
    stopVoiceSocket();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    interimIdRef.current = null;
    duplexAbortRef.current?.abort();
    duplexAbortRef.current = null;
    duplexTurnRef.current = false;
    stopSpeaking();
    setMicLive(false);
  };

  // Server TTS reply path (Piper WAV playback with honest progress driven
  // by the server-reported duration). Used by duplex and manual TTS when the
  // Server engine is selected and available.
  const speakServerReply = (text: string): Promise<void> => {
    if (!text.trim()) return Promise.resolve();
    return synthesizeServerSpeech({
      text: text.slice(0, SERVER_TTS_TEXT_CAP),
      voice: selectedServerVoice || undefined,
      speed,
    })
      .then(({ url, duration, revoke }) => {
        const handle = playServerAudio(url);
        serverAudioRef.current = { url, revoke, handle };
        setIsSpeaking(true);
        if (duration > 0) {
          const started = Date.now();
          progressTimerRef.current = window.setInterval(() => {
            setSpeakProgress(Math.min(0.99, (Date.now() - started) / (duration * 1000)));
          }, 200);
        }
        return handle.done;
      })
      .catch(() => {
        setEngineNote('Server TTS failed — select System to fall back');
      })
      .then(() => {
        if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
        serverAudioRef.current?.revoke();
        serverAudioRef.current = null;
        setIsSpeaking(false);
        setSpeakProgress(0);
      });
  };

  // Duplex loop: a final user utterance → assistant turn → spoken reply.
  // Turn-taking only (no barge-in): the turn flag is held through speech,
  // so utterances arriving mid-turn or mid-reply are skipped, never overlapped.
  const speakReply = (text: string): Promise<void> => {
    if (!text.trim()) return Promise.resolve();
    // Server engine speaks even without a local synthesis stack.
    if (ttsSource === 'server' && serverTtsAvailable) return speakServerReply(text);
    if (ttsEngine !== 'live') return Promise.resolve();
    return listSystemVoices()
      .then((voices) => {
        // OpenCode engine speaks through the selected catalog persona;
        // System uses the pinned system voice (or language auto-match).
        const def = ttsSource === 'opencode' ? ttsVoices.find((v) => v.id === selectedVoice) : undefined;
        const pinned = systemVoices.find((v) => v.voiceURI === selectedSystemVoice) ?? null;
        const handle = speakText({
          text,
          voice:
            ttsSource === 'system'
              ? (pinned ?? pickSystemVoice(voices, language))
              : pickSystemVoice(voices, def?.lang || language),
          lang: def?.lang || language,
          volume,
          rate: speed,
          pitch,
        });
        speakHandleRef.current = handle;
        setIsSpeaking(true);
        return handle.done;
      })
      .catch(() => {})
      .then(() => {
        speakHandleRef.current = null;
        setIsSpeaking(false);
      });
  };

  const runDuplexTurn = async (text: string) => {
    if (duplexTurnRef.current) return;
    // No spoken reply possible without a live TTS path (system synthesis or
    // the server Piper engine) — the transcript already recorded the turn.
    if (ttsEngine !== 'live' && !(ttsSource === 'server' && serverTtsAvailable)) return;
    const token = readAssistantToken();
    if (!token) return;
    duplexTurnRef.current = true;
    try {
      if (!conversationRef.current) conversationRef.current = await createAssistantConversation(token);
      const controller = new AbortController();
      duplexAbortRef.current = controller;
      let rowId: number | null = null;
      const result = await streamAssistantMessage(token, conversationRef.current, text, {
        signal: controller.signal,
        onDelta: (delta) => {
          if (rowId === null) {
            rowIdRef.current += 1;
            rowId = rowIdRef.current;
            const row: TranscriptRow = {
              id: rowId,
              speaker: 'assistant',
              text: delta,
              interim: true,
              time: nowTime(),
              confidence: 1,
            };
            setTranscript((t) => [...t, row]);
          } else {
            const id = rowId;
            setTranscript((t) => t.map((r) => (r.id === id ? { ...r, text: r.text + delta } : r)));
          }
        },
      });
      if (rowId !== null) {
        const id = rowId;
        setTranscript((t) => t.map((r) => (r.id === id ? { ...r, interim: false } : r)));
      }
      // 409 busy → the conversation stays server-side; use a fresh one next turn.
      if (result.ended === 'busy') conversationRef.current = null;
      // Awaited: the turn flag stays held through speech, so a reply is
      // never talked over. Abort during speech resolves via cancel → onend.
      if (result.ended === 'done' && result.text.trim()) await speakReply(result.text);
    } catch {
      // Offline or unreachable — the transcript already recorded the user
      // turn; the loop silently skips instead of erroring the session.
    } finally {
      duplexAbortRef.current = null;
      duplexTurnRef.current = false;
    }
  };

  const appendLiveResult = (result: SpeechResult) => {
    // Empty results (whisper heard nothing, muted mic) must never blank an
    // interim row or append an empty final — drop them, and never duplex them.
    if (!result.text.trim()) return;
    setStreamLatency(60 + Math.floor(Math.random() * 80));
    if (result.isFinal) {
      const finalized = interimIdRef.current;
      interimIdRef.current = null;
      if (finalized !== null) {
        setTranscript((t) =>
          t.map((r) =>
            r.id === finalized ? { ...r, text: result.text, interim: false, confidence: result.confidence } : r,
          ),
        );
      } else {
        rowIdRef.current += 1;
        const row: TranscriptRow = {
          id: rowIdRef.current,
          speaker: 'user',
          text: result.text,
          interim: false,
          time: nowTime(),
          confidence: result.confidence,
        };
        setTranscript((t) => [...t, row]);
      }
      if (modeRef.current === 'duplex') void runDuplexTurn(result.text);
    } else if (interimIdRef.current === null) {
      rowIdRef.current += 1;
      interimIdRef.current = rowIdRef.current;
      const row: TranscriptRow = {
        id: rowIdRef.current,
        speaker: 'user',
        text: result.text,
        interim: true,
        time: nowTime(),
        confidence: result.confidence,
      };
      setTranscript((t) => [...t, row]);
    } else {
      const id = interimIdRef.current;
      setTranscript((t) =>
        t.map((r) => (r.id === id ? { ...r, text: result.text, confidence: result.confidence } : r)),
      );
    }
  };

  // Whisper engine, live path: PCM frames stream over WS /ws/voice and each
  // VAD-bounded utterance resolves into the transcript incrementally. Any
  // failure (no token, no socket, no capture) falls back to batch upload.
  const startWhisperLive = async (): Promise<boolean> => {
    const token = readAssistantToken();
    if (!token || typeof WebSocket === 'undefined') return false;
    let stream: MediaStream | null = null;
    try {
      const mic = await openMicrophone();
      micRef.current = mic;
      setMicLive(true);
      stream = mic.stream;
    } catch {
      // No analyser (headless/denied AudioContext) — open a raw stream.
    }
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicNote('Mic blocked — Whisper capture needs microphone access');
      setIsRecording(false);
      return true;
    }
    let capture: PcmCapture | null = null;
    try {
      const socket = openVoiceSocket(
        token,
        {
          onReady: () => setEngineNote('Whisper live • WS streaming'),
          onPartial: (text) => appendLiveResult({ text, isFinal: false, confidence: 0.9 }),
          onFinal: (text, confidence) => appendLiveResult({ text, isFinal: true, confidence }),
          onError: (message) => setEngineNote(message),
        },
        language,
      );
      capture = capturePcm(stream, (samples, rate) => socket.pushPcm(samples, rate));
      wsRef.current = { socket, capture };
      await socket.ready;
      return true;
    } catch {
      // WS unreachable — release and let the caller fall back to batch.
    }
    wsRef.current = null;
    capture?.close();
    micRef.current?.close();
    micRef.current = null;
    setMicLive(false);
    return false;
  };

  // Whisper engine, batch path: record the utterance, then transcribe
  // server-side on stop (POST /api/stt). The analyser feed is best-effort —
  // a missing AudioContext keeps the waveform simulated without blocking
  // capture.
  const startWhisperBatch = async () => {
    if (typeof MediaRecorder === 'undefined') {
      setEngineNote('This browser cannot record audio — Whisper needs MediaRecorder');
      setIsRecording(false);
      return;
    }
    setEngineNote('Whisper batch • transcribes on stop');
    let stream: MediaStream | null = null;
    try {
      const mic = await openMicrophone();
      micRef.current = mic;
      setMicLive(true);
      stream = mic.stream;
    } catch {
      // No analyser (headless/denied AudioContext) — open a raw stream.
    }
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicNote('Mic blocked — Whisper capture needs microphone access');
      setIsRecording(false);
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const started = Date.now();
      void transcribeServerAudio(blob, language)
        .then((result) => {
          setStreamLatency(Date.now() - started);
          if (!result.text.trim()) {
            setEngineNote('Whisper returned no text for that utterance');
            return;
          }
          appendLiveResult({ text: result.text, isFinal: true, confidence: result.confidence });
        })
        .catch((error: unknown) => {
          setEngineNote(error instanceof Error ? error.message : 'Whisper transcription failed');
        });
    };
    recorderRef.current = recorder;
    recorder.start();
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopLiveCapture();
      setIsRecording(false);
      return;
    }
    setIsRecording(true);
    setMicNote(null);
    if (mode === 'tts') return;
    // Whisper records for server transcription; browser + OpenCode capture
    // through the live recognition engine (OpenCode attributes the turn to
    // the selected audio model in duplex).
    if (sttSource === 'whisper') {
      if (!serverSttAvailable) {
        setEngineNote('Whisper unavailable on the server — fell back to Browser capture');
        setSttSource('browser');
      } else {
        // Live WS first; batch upload on stop when the socket is unreachable.
        void startWhisperLive().then((live) => {
          if (!live) void startWhisperBatch();
        });
        return;
      }
    }
    if (sttEngine !== 'live') return;
    // Live mic (best-effort) + live recognition run independently; either
    // may fall back to simulation without blocking the other.
    if (support.microphone) {
      void openMicrophone()
        .then((mic) => {
          micRef.current = mic;
          setMicLive(true);
        })
        .catch(() => setMicNote('Mic blocked — waveform simulated'));
    }
    try {
      const session = startRecognition(
        language,
        (result) => appendLiveResult(result),
        () => setSttEngine('simulated'),
      );
      recognitionRef.current = session;
    } catch {
      setSttEngine('simulated');
    }
  };

  // Simulated STT streaming from fixture phrases — used when the browser
  // recognition API is unavailable or errored. Never runs for the Whisper
  // source: its transcript arrives from POST /api/stt on stop.
  useEffect(() => {
    if (!isRecording || mode === 'tts' || sttEngine !== 'simulated' || sttSource === 'whisper') return;
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < STREAM_PHRASES.length) {
        const text = STREAM_PHRASES[idx];
        const interim = Math.random() > 0.7;
        rowIdRef.current += 1;
        const row: TranscriptRow = {
          id: rowIdRef.current,
          speaker: 'user',
          text,
          interim,
          time: nowTime(),
          confidence: 0.92 + Math.random() * 0.07,
        };
        setTranscript((t) => [...t, row]);
        idx += 1;
        setStreamLatency(90 + Math.floor(Math.random() * 80));
      }
    }, 1800);
    return () => clearInterval(interval);
  }, [isRecording, mode, sttEngine, sttSource]);

  const handleSpeak = () => {
    if (isSpeaking) {
      speakHandleRef.current?.stop();
      speakHandleRef.current = null;
      serverAudioRef.current?.handle.stop();
      serverAudioRef.current?.revoke();
      serverAudioRef.current = null;
      if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
      stopSpeaking();
      if (speakTimerRef.current !== null) window.clearTimeout(speakTimerRef.current);
      setIsSpeaking(false);
      setSpeakProgress(0);
      return;
    }
    // Server engine speaks Piper WAV even without local synthesis; when the
    // server is down it falls back to System with a note (never silence).
    if (ttsSource === 'server') {
      if (!serverTtsAvailable) {
        setEngineNote('Server TTS unavailable — fell back to System');
      } else {
        setEngineNote(null);
        void speakServerReply(ttsText);
        return;
      }
    }
    setIsSpeaking(true);
    if (ttsEngine !== 'live') {
      setSpeakProgress(0.6);
      speakTimerRef.current = window.setTimeout(() => {
        setIsSpeaking(false);
        setSpeakProgress(0);
      }, 4000);
      return;
    }
    setSpeakProgress(0);
    void listSystemVoices()
      .then((voices) => {
        const def = ttsSource === 'opencode' ? ttsVoices.find((v) => v.id === selectedVoice) : undefined;
        const pinned = systemVoices.find((v) => v.voiceURI === selectedSystemVoice) ?? null;
        const handle = speakText({
          text: ttsText,
          voice:
            ttsSource === 'system'
              ? (pinned ?? pickSystemVoice(voices, language))
              : pickSystemVoice(voices, def?.lang || language),
          lang: def?.lang || language,
          volume,
          rate: speed,
          pitch,
          onBoundary: (charIndex) => setSpeakProgress(Math.min(0.99, charIndex / Math.max(1, ttsText.length))),
        });
        speakHandleRef.current = handle;
        return handle.done;
      })
      .catch(() => {})
      .then(() => {
        speakHandleRef.current = null;
        setIsSpeaking(false);
        setSpeakProgress(0);
      });
  };

  const selectedVoiceKind = ttsVoices.find((v) => v.id === selectedVoice)?.kind || 'Muse Spark';

  const visibleStt = selectedProvider === 'all' ? sttModels : sttModels.filter((m) => m.provider === selectedProvider);
  const visibleTts = selectedProvider === 'all' ? ttsVoices : ttsVoices.filter((v) => v.provider === selectedProvider);

  const providerAudioCount = (id: string) =>
    sttModels.filter((m) => m.provider === id).length + ttsVoices.filter((v) => v.provider === id).length;

  const selectProvider = (id: string) => {
    setSelectedProvider(id);
    if (id === 'all') return;
    const sttHome = sttModels.some((m) => m.id === selectedSTTModel && m.provider === id);
    if (!sttHome) {
      const first = sttModels.find((m) => m.provider === id);
      if (first) setSelectedSTTModel(first.id);
    }
    const ttsHome = ttsVoices.some((v) => v.id === selectedVoice && v.provider === id);
    if (!ttsHome) {
      const first = ttsVoices.find((v) => v.provider === id);
      if (first) setSelectedVoice(first.id);
    }
  };

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-[260px_1fr_320px] bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-primary)]">
      {/* Left rail — mode + models + voices */}
      <div className="border-r border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] flex flex-col">
        <div className="p-3 border-b border-[var(--vestara-border-shell)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-accent-shell)]/15 border border-[var(--vestara-accent-shell)]/20 flex items-center justify-center">
              <Waves size={12} className="text-[var(--vestara-accent-shell)]" />
            </div>
            <div>
              <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
                {VOICE_STREAMING_TITLE}
              </div>
              <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                {VOICE_STREAMING_SUBTITLE}
              </div>
            </div>
            <span
              aria-hidden="true"
              className={`ml-auto w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-[var(--vestara-status-shell-danger)] animate-pulse' : 'bg-[var(--vestara-text-shell-muted)]'}`}
            />
          </div>
          <div
            role="tablist"
            aria-label="Voice streaming mode"
            className="mt-3 flex rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-0.5"
          >
            {VOICE_STREAMING_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 px-2 py-1 rounded-full text-[length:var(--vestara-font-size-caption)] capitalize flex items-center justify-center gap-1 ${mode === m ? 'bg-[var(--vestara-accent-shell)] text-[var(--vestara-color-shell-ink)] font-bold' : 'text-[var(--vestara-text-shell-secondary)]'}`}
              >
                {m === 'stt' ? <Mic size={10} /> : m === 'tts' ? <Volume2 size={10} /> : <Radio size={10} />}
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-3">
          <div>
            <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
              VOICE ENGINE
            </div>
            <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] mb-1">
              STT SOURCE
            </div>
            <div className="space-y-1" role="radiogroup" aria-label="STT source engine">
              {VOICE_STT_SOURCES.map((s) => {
                // OpenCode capture always works: browser engine in, selected
                // audio model attributed on the duplex turn (live or fixture).
                const unavailable = s.id === 'whisper' ? !serverSttAvailable : false;
                const reason = s.id === 'whisper' ? serverSttDetail : '';
                const active = sttSource === s.id;
                return (
                  <label
                    key={s.id}
                    title={unavailable ? reason : s.hint}
                    className={`block w-full text-left px-2 py-1.5 rounded-[var(--vestara-radius-lg)] border ${unavailable ? 'opacity-60 bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]' : active ? 'bg-[var(--vestara-accent-shell)]/10 border-[var(--vestara-accent-shell)]/30 cursor-pointer' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)] hover:border-[var(--vestara-accent-shell)]/20 cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="voice-stt-source"
                      checked={active}
                      disabled={unavailable}
                      onChange={() => {
                        setSttSource(s.id as VoiceSttSource);
                        setEngineNote(null);
                      }}
                      aria-label={`STT source engine: ${s.name}`}
                      className="sr-only"
                    />
                    <div className="text-[length:var(--vestara-font-size-label)] font-medium">{s.name}</div>
                    <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                      {unavailable ? reason : s.hint}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] mt-2 mb-1">
              TTS SOURCE
            </div>
            <div className="space-y-1" role="radiogroup" aria-label="TTS source engine">
              {VOICE_TTS_SOURCES.map((s) => {
                // OpenCode personas always speak: catalog voice mapping over
                // the system engine (live catalog or fixture fallback).
                const unavailable =
                  s.id === 'server' ? !serverTtsAvailable : s.id === 'opencode' ? false : !support.speechSynthesis;
                const reason =
                  s.id === 'server'
                    ? serverTtsDetail
                    : s.id === 'system'
                      ? 'speechSynthesis unsupported in this browser'
                      : '';
                const active = ttsSource === s.id;
                return (
                  <label
                    key={s.id}
                    title={unavailable ? reason : s.hint}
                    className={`block w-full text-left px-2 py-1.5 rounded-[var(--vestara-radius-lg)] border ${unavailable ? 'opacity-60 bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]' : active ? 'bg-[var(--vestara-accent-theme-violet)]/10 border-[var(--vestara-accent-theme-violet)]/30 cursor-pointer' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)] hover:border-[var(--vestara-accent-theme-violet)]/20 cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="voice-tts-source"
                      checked={active}
                      disabled={unavailable}
                      onChange={() => {
                        setTtsSource(s.id as VoiceTtsSource);
                        setEngineNote(null);
                      }}
                      aria-label={`TTS source engine: ${s.name}`}
                      className="sr-only"
                    />
                    <div className="text-[length:var(--vestara-font-size-label)] font-medium">{s.name}</div>
                    <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                      {unavailable ? reason : s.hint}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
              VOICE PROVIDER
            </div>
            <div className="space-y-1" role="radiogroup" aria-label="Voice provider">
              {[{ id: 'all', name: 'All providers' }, ...voiceProviders].map((p) => {
                const count = p.id === 'all' ? sttModels.length + ttsVoices.length : providerAudioCount(p.id);
                const active = selectedProvider === p.id;
                return (
                  <label
                    key={p.id}
                    className={`block w-full text-left px-2 py-2 rounded-[var(--vestara-radius-lg)] border cursor-pointer ${active ? 'bg-[var(--vestara-accent-shell)]/10 border-[var(--vestara-accent-shell)]/30' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)] hover:border-[var(--vestara-accent-shell)]/20'}`}
                  >
                    <input
                      type="radio"
                      name="voice-provider"
                      checked={active}
                      onChange={() => selectProvider(p.id)}
                      aria-label={`Voice provider filter: ${p.name}`}
                      className="sr-only"
                    />
                    <div className="text-[length:var(--vestara-font-size-label)] font-medium">{p.name}</div>
                    <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                      {count} audio models
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
              STT MODEL
            </div>
            <div className="space-y-1">
              {visibleStt.length === 0 && (
                <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] py-2 text-center">
                  No audio models for this provider.
                </div>
              )}
              {visibleStt.map((m) => (
                <button
                  key={`${m.provider}/${m.id}`}
                  type="button"
                  onClick={() => setSelectedSTTModel(m.id)}
                  className={`w-full text-left px-2 py-2 rounded-[var(--vestara-radius-lg)] border ${selectedSTTModel === m.id ? 'bg-[var(--vestara-accent-shell)]/10 border-[var(--vestara-accent-shell)]/30' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)] hover:border-[var(--vestara-accent-shell)]/20'}`}
                >
                  <div className="text-[length:var(--vestara-font-size-label)] font-medium">{m.name}</div>
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] flex gap-2">
                    {m.live ? (
                      <span>
                        {m.provider} • {m.family || 'audio'} • audio in
                      </span>
                    ) : (
                      <>
                        <span>{m.latency} latency</span>
                        <span>{m.langs} langs</span>
                      </>
                    )}
                    {m.accuracy > 0 && (
                      <span className="text-[var(--vestara-status-shell-success)]">{m.accuracy}% acc</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
              TTS VOICES • {ttsSource === 'server' ? 'Piper' : language}
            </div>
            {ttsSource === 'server' ? (
              <div className="space-y-1">
                {serverTtsVoices.length === 0 && (
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] py-2 text-center">
                    No server voices — Piper needs a model (VESTARA_PIPER_MODEL).
                  </div>
                )}
                {serverTtsVoices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedServerVoice(v.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-[var(--vestara-radius-lg)] border flex items-center gap-2 ${selectedServerVoice === v.id ? 'bg-[var(--vestara-accent-theme-violet)]/10 border-[var(--vestara-accent-theme-violet)]/30' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-caption)] font-bold">
                      {v.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--vestara-font-size-caption)] truncate">{v.name}</div>
                      <div className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-muted)]">
                        server • {v.lang} • WAV
                      </div>
                    </div>
                    {selectedServerVoice === v.id && (
                      <div className="w-2 h-2 rounded-full bg-[var(--vestara-accent-theme-violet)] animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            ) : ttsSource === 'system' ? (
              <div className="space-y-1">
                {systemVoices.length === 0 && (
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] py-2 text-center">
                    No system voices detected in this browser.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedSystemVoice('')}
                  className={`w-full text-left px-2 py-1.5 rounded-[var(--vestara-radius-lg)] border ${selectedSystemVoice === '' ? 'bg-[var(--vestara-accent-theme-violet)]/10 border-[var(--vestara-accent-theme-violet)]/30' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]'}`}
                >
                  <div className="text-[length:var(--vestara-font-size-caption)]">Auto-match • {language}</div>
                  <div className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-muted)]">
                    Best system voice for the language
                  </div>
                </button>
                {systemVoices.map((v) => (
                  <button
                    key={v.voiceURI}
                    type="button"
                    onClick={() => setSelectedSystemVoice(v.voiceURI)}
                    className={`w-full text-left px-2 py-1.5 rounded-[var(--vestara-radius-lg)] border flex items-center gap-2 ${selectedSystemVoice === v.voiceURI ? 'bg-[var(--vestara-accent-theme-violet)]/10 border-[var(--vestara-accent-theme-violet)]/30' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-caption)] font-bold">
                      {v.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--vestara-font-size-caption)] truncate">{v.name}</div>
                      <div className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-muted)]">
                        system • {v.lang}
                      </div>
                    </div>
                    {selectedSystemVoice === v.voiceURI && (
                      <div className="w-2 h-2 rounded-full bg-[var(--vestara-accent-theme-violet)] animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {visibleTts.length === 0 && (
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] py-2 text-center">
                    No audio models for this provider.
                  </div>
                )}
                {visibleTts.map((v) => (
                  <button
                    key={`${v.provider}/${v.id}`}
                    type="button"
                    onClick={() => setSelectedVoice(v.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-[var(--vestara-radius-lg)] border flex items-center gap-2 ${selectedVoice === v.id ? 'bg-[var(--vestara-accent-theme-violet)]/10 border-[var(--vestara-accent-theme-violet)]/30' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-caption)] font-bold">
                      {v.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--vestara-font-size-caption)] truncate">{v.name}</div>
                      <div className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-muted)]">
                        {v.live ? `${v.provider} • ${v.kind} • audio out` : `${v.lang} • ${v.gender} • ${v.kind}`}
                      </div>
                    </div>
                    {selectedVoice === v.id && (
                      <div className="w-2 h-2 rounded-full bg-[var(--vestara-accent-theme-violet)] animate-pulse" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-2.5">
            <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] mb-2">
              STREAM CONFIG
            </div>
            <div className="space-y-2 text-[length:var(--vestara-font-size-caption)]">
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">Language</span>
                <span className="text-[var(--vestara-accent-shell)] flex items-center gap-1">
                  <Globe size={10} />
                  {language} • 99 langs
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">Latency</span>
                <span className="text-[var(--vestara-status-shell-success)]">{streamLatency}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">Zero Retention</span>
                <span className="text-[var(--vestara-status-shell-success)]">ON • HIPAA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">Offline Queue</span>
                <span className="text-[var(--vestara-accent-shell)]">ON</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">STT Engine</span>
                <span
                  className={
                    sttEngine === 'live'
                      ? 'text-[var(--vestara-status-shell-success)]'
                      : 'text-[var(--vestara-text-shell-muted)]'
                  }
                >
                  {sttEngine === 'live' ? 'Web Speech • live' : 'Simulated'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">TTS Engine</span>
                <span
                  className={
                    ttsEngine === 'live'
                      ? 'text-[var(--vestara-status-shell-success)]'
                      : 'text-[var(--vestara-text-shell-muted)]'
                  }
                >
                  {ttsEngine === 'live' ? `System • ${systemVoiceCount} voices` : 'Simulated'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">STT Source</span>
                <span
                  className={
                    sttSource === 'whisper'
                      ? serverSttAvailable
                        ? 'text-[var(--vestara-status-shell-success)]'
                        : 'text-[var(--vestara-status-shell-warning)]'
                      : 'text-[var(--vestara-text-shell-primary)]'
                  }
                >
                  {sttSource === 'whisper'
                    ? serverSttAvailable
                      ? 'Whisper • server'
                      : 'Whisper • down'
                    : sttSource === 'opencode'
                      ? `OpenCode • ${selectedSTTModel}`
                      : 'Browser • Web Speech'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--vestara-text-shell-muted)]">TTS Source</span>
                <span
                  className={
                    ttsSource === 'server'
                      ? serverTtsAvailable
                        ? 'text-[var(--vestara-status-shell-success)]'
                        : 'text-[var(--vestara-status-shell-warning)]'
                      : 'text-[var(--vestara-text-shell-primary)]'
                  }
                >
                  {ttsSource === 'server'
                    ? serverTtsAvailable
                      ? `Piper • ${serverTtsVoices.length} voices`
                      : 'Piper • down'
                    : ttsSource === 'opencode'
                      ? `OpenCode • ${selectedVoice}`
                      : `System • ${systemVoiceCount} voices`}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-3 border-t border-[var(--vestara-border-shell)]">
          <div className="grid grid-cols-3 gap-1 text-[length:var(--vestara-font-size-caption)] text-center">
            {VOICE_FOOTER_STATS.map((s) => (
              <div
                key={s.label}
                className="rounded bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] p-1.5"
              >
                <div className="text-[var(--vestara-accent-shell)]">{s.value}</div>
                <div className="text-[var(--vestara-text-shell-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Center — waveform + transcript / TTS */}
      <div className="flex flex-col bg-[var(--vestara-surface-shell-panel)]">
        <div className="h-11 border-b border-[var(--vestara-border-shell)] px-3 flex items-center justify-between bg-[var(--vestara-surface-shell-raised)]/50">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
              {mode.toUpperCase()} STREAMING
            </span>
            <span className="text-[length:var(--vestara-font-size-label)] font-medium">
              {mode === 'stt'
                ? 'Live Transcription • Maria Santos • Community MH'
                : mode === 'tts'
                  ? 'Speech Synthesis • Muse Spark • Streaming'
                  : 'Duplex • Real-time conversation'}
            </span>
            <span
              className={`text-[length:var(--vestara-font-size-micro-small)] font-mono px-1.5 py-0.5 rounded-full border ${
                voiceState === 'live'
                  ? 'border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 text-[var(--vestara-status-shell-success)]'
                  : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-muted)]'
              }`}
            >
              {voiceState === 'live' ? 'LIVE' : voiceState === 'loading' ? '…' : 'SNAPSHOT'}
            </span>
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${isRecording || isSpeaking ? 'bg-[var(--vestara-status-shell-danger)] animate-pulse' : 'bg-[var(--vestara-text-shell-muted)]'}`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleRecording}
              className={`px-2.5 py-1 rounded-full border text-[length:var(--vestara-font-size-caption)] flex items-center gap-1 ${isRecording ? 'bg-[var(--vestara-status-shell-danger)]/10 border-[var(--vestara-status-shell-danger)]/30 text-[var(--vestara-status-shell-danger)]' : 'bg-[var(--vestara-accent-shell)]/10 border-[var(--vestara-accent-shell)]/30 text-[var(--vestara-accent-shell)]'}`}
            >
              <Mic size={10} />
              {isRecording ? 'Stop' : 'Record'}
            </button>
            <button
              type="button"
              onClick={handleSpeak}
              className={`px-2.5 py-1 rounded-full border text-[length:var(--vestara-font-size-caption)] flex items-center gap-1 ${isSpeaking ? 'bg-[var(--vestara-accent-theme-violet)]/20 border-[var(--vestara-accent-theme-violet)]/30 text-[var(--vestara-accent-theme-violet)]' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)]'}`}
            >
              <Volume2 size={10} />
              {isSpeaking ? 'Speaking' : 'Speak'}
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)]">
          <canvas
            ref={canvasRef}
            width={600}
            height={64}
            aria-label="Streaming waveform"
            className="w-full h-16 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)]"
          />
          <div className="mt-2 flex items-center gap-3 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
            <span className="flex items-center gap-1">
              <Activity size={10} className="text-[var(--vestara-accent-shell)]" />
              Waveform • {isRecording ? (micLive ? 'Live mic' : sttEngine === 'live' ? 'Live' : 'Simulated') : 'Idle'}
            </span>
            {micNote && <span className="text-[var(--vestara-status-shell-warning)]">{micNote}</span>}
            {engineNote && <span className="text-[var(--vestara-status-shell-warning)]">{engineNote}</span>}
            <span>•</span>
            <span className="flex items-center gap-1">
              <Zap size={10} className="text-[var(--vestara-status-shell-success)]" />
              {streamLatency}ms latency
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Radio size={10} className="text-[var(--vestara-accent-theme-violet)]" />
              Streaming • No audio retained
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {mode === 'stt' || mode === 'duplex' ? (
            <div>
              <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
                LIVE TRANSCRIPTION • INTERIM + FINAL
              </div>
              <div className="space-y-1.5">
                {transcript.length === 0 ? (
                  <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-muted)] py-8 text-center">
                    {VOICE_EMPTY_TRANSCRIPT}
                  </div>
                ) : (
                  transcript.map((t) => (
                    <div
                      key={t.id}
                      className={`flex gap-2 p-2 rounded-[var(--vestara-radius-lg)] border ${t.speaker === 'assistant' ? 'bg-[var(--vestara-accent-theme-violet)]/5 border-[var(--vestara-accent-theme-violet)]/20' : t.interim ? 'bg-[var(--vestara-status-shell-warning)]/5 border-[var(--vestara-status-shell-warning)]/20' : 'bg-[var(--vestara-surface-shell-raised)] border-[var(--vestara-border-shell)]'}`}
                    >
                      <span
                        className={`text-[length:var(--vestara-font-size-caption)] px-1.5 py-0.5 rounded-full border h-fit ${t.speaker === 'assistant' ? 'bg-[var(--vestara-accent-theme-violet)]/10 border-[var(--vestara-accent-theme-violet)]/20 text-[var(--vestara-accent-theme-violet)]' : t.interim ? 'bg-[var(--vestara-status-shell-warning)]/10 border-[var(--vestara-status-shell-warning)]/20 text-[var(--vestara-status-shell-warning)]' : 'bg-[var(--vestara-accent-shell)]/10 border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]'}`}
                      >
                        {t.speaker === 'assistant'
                          ? t.interim
                            ? 'Thinking…'
                            : 'Assistant'
                          : t.interim
                            ? 'Interim'
                            : 'Final'}
                      </span>
                      <span className="text-[length:var(--vestara-font-size-label)] flex-1">{t.text}</span>
                      <span className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                        {t.time} • {Math.round(t.confidence * 100)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
              {isRecording && (
                <div className="mt-2 flex items-center gap-2 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--vestara-status-shell-danger)] animate-pulse" />
                  {sttSource === 'whisper'
                    ? `Whisper • ${language} • server batch on stop`
                    : `Streaming • ${selectedSTTModel} • ${language} • Partial results enabled`}
                </div>
              )}
            </div>
          ) : null}

          {mode === 'tts' || mode === 'duplex' ? (
            <div>
              <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
                TTS INPUT • STREAMING SYNTHESIS
              </div>
              <label htmlFor="voice-tts-input" className="sr-only">
                Text to synthesize
              </label>
              <textarea
                id="voice-tts-input"
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                className="w-full h-[120px] rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)] outline-none focus:border-[var(--vestara-accent-theme-violet)]/30"
                placeholder="Enter text to synthesize..."
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-2">
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                    Volume {volume}%
                  </div>
                  <input
                    type="range"
                    aria-label="TTS volume"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--vestara-accent-shell)]"
                  />
                </div>
                <div className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-2">
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                    Speed {speed}x
                  </div>
                  <input
                    type="range"
                    aria-label="TTS speed"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-[var(--vestara-accent-theme-violet)]"
                  />
                </div>
                <div className="rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-2">
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                    Pitch {pitch}
                  </div>
                  <input
                    type="range"
                    aria-label="TTS pitch"
                    min={-10}
                    max={10}
                    value={pitch}
                    onChange={(e) => setPitch(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--vestara-status-shell-warning)]"
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSpeak}
                  className={`px-3 py-1.5 rounded-full text-[length:var(--vestara-font-size-label)] font-bold flex items-center gap-1 ${isSpeaking ? 'bg-[var(--vestara-status-shell-danger)] text-[var(--vestara-text-shell-bright)]' : 'bg-[var(--vestara-accent-theme-violet)] text-[var(--vestara-text-shell-bright)]'}`}
                >
                  <Play size={12} />
                  {isSpeaking ? 'Stop Streaming' : 'Stream TTS'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)] flex items-center gap-1"
                >
                  <Download size={10} />
                  Export WAV
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)] flex items-center gap-1"
                >
                  <Headphones size={10} />
                  Preview
                </button>
              </div>
              {isSpeaking && (
                <div className="mt-2 h-1.5 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--vestara-accent-shell)] to-[var(--vestara-accent-theme-violet)]"
                    style={{ width: `${Math.round(speakProgress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ) : null}

          {mode === 'duplex' && (
            <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-accent-shell)]/5 border border-[var(--vestara-accent-shell)]/15 p-3">
              <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-1">
                DUPLEX MODE • FULL CONVERSATION LOOP
              </div>
              <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)]">
                Final utterances → assistant turn → spoken reply, streamed back through the selected TTS voice.
                Turn-taking (in-flight turns are skipped, never overlapped), VAD, echo cancellation. Sign in for the
                assistant loop — otherwise duplex records both sides without replying. Used for: Clinical Notes AI
                real-time coaching, Supervise practice patients MI/CBT, Front Door AI receptionist.
              </div>
            </div>
          )}
        </div>

        <div className="h-12 border-t border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-raised)] flex items-center px-3 gap-2">
          <Mic size={12} className="text-[var(--vestara-text-shell-muted)]" />
          <label htmlFor="voice-stream-input" className="sr-only">
            Send to stream
          </label>
          <input
            id="voice-stream-input"
            placeholder={
              mode === 'stt'
                ? 'STT streaming • Speak or type to simulate interim...'
                : mode === 'tts'
                  ? 'Type text and press Stream TTS...'
                  : 'Duplex: type message for TTS response...'
            }
            className="flex-1 bg-transparent outline-none text-[length:var(--vestara-font-size-label)] placeholder:text-[var(--vestara-text-shell-muted)]"
          />
          <button
            type="button"
            className="px-3 py-1 rounded-full bg-[var(--vestara-accent-shell)] text-[var(--vestara-color-shell-ink)] text-[length:var(--vestara-font-size-label)] font-bold"
          >
            Send to Stream
          </button>
        </div>
      </div>

      {/* Right rail — metrics + pipeline */}
      <div className="border-l border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-3 overflow-auto space-y-3">
        <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-2.5">
          <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
            STREAM METRICS
          </div>
          <div className="space-y-1.5 text-[length:var(--vestara-font-size-caption)]">
            <div className="flex justify-between">
              <span className="text-[var(--vestara-text-shell-muted)]">STT Latency</span>
              <span className="text-[var(--vestara-status-shell-success)]">{streamLatency}ms • Streaming</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vestara-text-shell-muted)]">TTS First Byte</span>
              <span className="text-[var(--vestara-accent-theme-violet)]">89ms • {selectedVoiceKind}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vestara-text-shell-muted)]">Duplex Engine</span>
              <span className="text-[var(--vestara-accent-shell)] font-mono truncate max-w-[55%]">{duplexModelId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vestara-text-shell-muted)]">Turn Latency (Duplex)</span>
              <span className="text-[var(--vestara-accent-shell)]">&lt;300ms target</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vestara-text-shell-muted)]">Confidence</span>
              <span className="text-[var(--vestara-text-shell-primary)]">92-99%</span>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] p-2.5">
          <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-2">
            AUDIO PIPELINE
          </div>
          <div className="space-y-1 text-[length:var(--vestara-font-size-caption)] font-mono">
            {AUDIO_PIPELINE.map((step, i) => (
              <div
                key={step.id}
                className="flex items-center gap-2 p-1.5 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)]"
              >
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-[var(--vestara-status-shell-success)]' : i === 1 ? 'bg-[var(--vestara-accent-shell)]' : i === 2 ? 'bg-[var(--vestara-accent-theme-violet)]' : 'bg-[var(--vestara-status-shell-warning)]'}`}
                />
                {step.label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-accent-shell)]/5 border border-[var(--vestara-accent-shell)]/15 p-2.5">
          <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] mb-1">
            CLINICAL NOTES INTEGRATION
          </div>
          <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)] space-y-1">
            {CLINICAL_INTEGRATIONS.map((line) => (
              <div key={line}>• {line}</div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="h-7 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[length:var(--vestara-font-size-caption)]"
          >
            Clear Transcript
          </button>
          <button
            type="button"
            className="h-7 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[length:var(--vestara-font-size-caption)]"
          >
            Export JSON
          </button>
          <button
            type="button"
            className="h-7 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[length:var(--vestara-font-size-caption)]"
          >
            Save Session
          </button>
          <button
            type="button"
            className="h-7 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-accent-shell)] text-[var(--vestara-color-shell-ink)] text-[length:var(--vestara-font-size-caption)] font-bold"
          >
            Sync to EHR
          </button>
        </div>

        <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
          {VOICE_COMPLIANCE_NOTE}
        </div>
      </div>
    </div>
  );
}
