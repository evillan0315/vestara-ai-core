// Browser voice engine — real mic/STT/TTS via Web APIs with capability
// detection. Callers fall back to simulation when an API is unavailable
// (unsupported browser, denied mic, headless test env).

export interface VoiceEngineSupport {
  speechRecognition: boolean;
  speechSynthesis: boolean;
  microphone: boolean;
}

type RecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }>;
}

export interface SpeechResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface SpeakHandle {
  stop: () => void;
  done: Promise<void>;
}

function getWindow(): (Window & Record<string, unknown>) | null {
  if (typeof window === 'undefined') return null;
  return window as Window & Record<string, unknown>;
}

/** Normalize `EN-US`/`en_us` style tags to BCP-47 (`en-US`). */
export function toBcp47(lang: string): string {
  const [primary = '', ...rest] = lang.replace(/_/g, '-').split('-');
  return [primary.toLowerCase(), ...rest.map((s) => s.toUpperCase())].join('-');
}

/** Which browser voice APIs are available right now. */
export function voiceEngineSupport(): VoiceEngineSupport {
  const w = getWindow();
  if (!w) return { speechRecognition: false, speechSynthesis: false, microphone: false };
  const recognition = typeof w.SpeechRecognition === 'function' || typeof w.webkitSpeechRecognition === 'function';
  return {
    speechRecognition: recognition,
    speechSynthesis: typeof w.speechSynthesis !== 'undefined' && w.speechSynthesis !== null,
    microphone: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  };
}

/** System TTS voices; resolves once the async voice list loads (or times out). */
export function listSystemVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const w = getWindow();
  const synth = w?.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof synth.getVoices !== 'function') return Promise.resolve([]);
  const loaded = synth.getVoices();
  if (loaded.length > 0) return Promise.resolve(loaded);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(synth.getVoices()), timeoutMs);
    const onVoices = () => {
      window.clearTimeout(timer);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', onVoices, { once: true });
  });
}

/** Best-match system voice for a BCP-47 lang tag (fixture tags are `EN-US` style). */
export function pickSystemVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const needle = lang.toLowerCase().replace('_', '-');
  const prefix = needle.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === needle) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

export interface SpeakOptions {
  text: string;
  voice: SpeechSynthesisVoice | null;
  lang: string;
  /** 0–100, mapped to utterance volume. */
  volume: number;
  /** 0.5–2 playback rate. */
  rate: number;
  /** -10–10 shell pitch, mapped to utterance 0–2. */
  pitch: number;
  onBoundary?: (charIndex: number) => void;
}

/**
 * Speak via speechSynthesis. Cancels any in-flight utterance first.
 * Resolves when the utterance ends (or errors); rejects only when the
 * synthesis API itself is missing.
 */
export function speakText(options: SpeakOptions): SpeakHandle {
  const w = getWindow();
  const synth = w?.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth) {
    return { stop: () => {}, done: Promise.reject(new Error('speechSynthesis unavailable')) };
  }
  synth.cancel();
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const utterance = new SpeechSynthesisUtterance(options.text);
  utterance.lang = toBcp47(options.lang);
  utterance.volume = Math.min(1, Math.max(0, options.volume / 100));
  utterance.rate = Math.min(2, Math.max(0.5, options.rate));
  utterance.pitch = Math.min(2, Math.max(0, (options.pitch + 10) / 10));
  if (options.voice) utterance.voice = options.voice;
  utterance.onend = () => resolveDone();
  utterance.onerror = () => resolveDone();
  if (options.onBoundary) {
    const onBoundary = options.onBoundary;
    utterance.onboundary = (event) => onBoundary(event.charIndex);
  }
  synth.speak(utterance);
  return { stop: () => synth.cancel(), done };
}

/** Stop any in-flight synthesis. */
export function stopSpeaking(): void {
  getWindow()?.speechSynthesis?.cancel();
}

export interface RecognitionSession {
  stop: () => void;
}

/**
 * Continuous interim-result recognition session. Throws when the
 * SpeechRecognition API is unavailable.
 */
export function startRecognition(
  lang: string,
  onResult: (result: SpeechResult) => void,
  onError?: (message: string) => void,
): RecognitionSession {
  const w = getWindow();
  const Ctor = (w?.SpeechRecognition ?? w?.webkitSpeechRecognition) as RecognitionConstructor | undefined;
  if (!w || typeof Ctor !== 'function') throw new Error('speechRecognition unavailable');
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = toBcp47(lang);
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const best = result[0];
      if (best) {
        onResult({
          text: best.transcript,
          isFinal: result.isFinal,
          confidence: typeof best.confidence === 'number' ? best.confidence : 0.9,
        });
      }
    }
  };
  recognition.onerror = (event) => onError?.(event?.error ?? 'recognition-error');
  recognition.onend = () => {
    // Continuous sessions self-restart on transient ends while recording.
    try {
      recognition.start();
    } catch {
      // Already stopped — leave it ended.
    }
  };
  recognition.start();
  return { stop: () => recognition.stop() };
}

/** Open the mic and expose a live frequency analyser for the waveform. */
export async function openMicrophone(): Promise<{
  stream: MediaStream;
  analyser: AnalyserNode;
  data: Uint8Array;
  close: () => void;
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('microphone unavailable');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (typeof AudioCtor !== 'function') {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('audioContext unavailable');
  }
  const context = new AudioCtor();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  return {
    stream,
    analyser,
    data,
    close: () => {
      stream.getTracks().forEach((t) => t.stop());
      void context.close().catch(() => {});
    },
  };
}
