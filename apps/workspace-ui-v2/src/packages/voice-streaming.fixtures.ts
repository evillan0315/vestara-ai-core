// Voice streaming fixture — modes, models, voices, phrases, pipeline.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts
// (fixture-first fallback; no arrays in JSX).
//
// Offline fallback mirrors the live OpenCode projection
// (GET /api/opencode/config/providers): provider `opencode`, muse-spark
// family, audio-capable models. Live entries overlay these when reachable.

export type VoiceStreamMode = 'stt' | 'tts' | 'duplex';

export const VOICE_STREAMING_MODES: VoiceStreamMode[] = ['stt', 'tts', 'duplex'];

export const VOICE_STREAMING_TITLE = 'VOICE STREAMING';

export const VOICE_STREAMING_SUBTITLE = 'STT • TTS • Duplex • OpenCode audio';

export interface SttModelDef {
  id: string;
  name: string;
  provider: string;
  family?: string;
  latency: string;
  langs: number;
  accuracy: number;
  /** Live catalog entries resolve latency/langs/accuracy server-side. */
  live?: boolean;
}

export const STT_MODELS: SttModelDef[] = [
  {
    id: 'muse-spark-1.3',
    name: 'Muse Spark 1.3 • Streaming',
    provider: 'opencode',
    family: 'muse-spark',
    latency: '145ms',
    langs: 99,
    accuracy: 96.2,
  },
  {
    id: 'muse-spark-1.3-realtime',
    name: 'Muse Spark 1.3 • Realtime',
    provider: 'opencode',
    family: 'muse-spark',
    latency: '89ms',
    langs: 36,
    accuracy: 95.8,
  },
  {
    id: 'muse-spark-1.2-audio',
    name: 'Muse Spark 1.2 • Audio',
    provider: 'opencode',
    family: 'muse-spark',
    latency: '120ms',
    langs: 40,
    accuracy: 94.5,
  },
];

export interface TtsVoiceDef {
  id: string;
  name: string;
  provider: string;
  lang: string;
  gender: string;
  kind: string;
  /** Live catalog entries carry the model family instead of a persona. */
  live?: boolean;
}

export const TTS_VOICES: TtsVoiceDef[] = [
  {
    id: 'muse-spark-1.3-aria',
    name: 'Aria • Spark • Warm',
    provider: 'opencode',
    lang: 'EN-US',
    gender: 'Female',
    kind: 'Muse Spark 1.3',
  },
  {
    id: 'muse-spark-1.3-guy',
    name: 'Guy • Spark • Deep',
    provider: 'opencode',
    lang: 'EN-US',
    gender: 'Male',
    kind: 'Muse Spark 1.3',
  },
  {
    id: 'muse-spark-1.3-sofia',
    name: 'Sofia • Spark • ES',
    provider: 'opencode',
    lang: 'ES-US',
    gender: 'Female',
    kind: 'Muse Spark 1.3',
  },
  {
    id: 'muse-spark-1.3-aarav',
    name: 'Aarav • Spark • HI',
    provider: 'opencode',
    lang: 'HI-IN',
    gender: 'Male',
    kind: 'Muse Spark 1.3',
  },
  {
    id: 'muse-spark-1.3-yuki',
    name: 'Yuki • Spark • JA',
    provider: 'opencode',
    lang: 'JA-JP',
    gender: 'Female',
    kind: 'Muse Spark 1.3',
  },
];

export interface VoiceProviderDef {
  id: string;
  name: string;
}

export const VOICE_PROVIDERS: VoiceProviderDef[] = [{ id: 'opencode', name: 'OpenCode' }];

export type VoiceSttSource = 'browser' | 'whisper' | 'opencode';

export type VoiceTtsSource = 'system' | 'server' | 'opencode';

export interface VoiceSourceOption {
  id: string;
  name: string;
  hint: string;
}

export const VOICE_STT_SOURCES: VoiceSourceOption[] = [
  { id: 'browser', name: 'Browser', hint: 'Web Speech • no server' },
  { id: 'whisper', name: 'Whisper', hint: 'Server STT • POST /api/stt' },
  { id: 'opencode', name: 'OpenCode', hint: 'Audio model • duplex loop' },
];

export const VOICE_TTS_SOURCES: VoiceSourceOption[] = [
  { id: 'system', name: 'System', hint: 'speechSynthesis • local' },
  { id: 'server', name: 'Server', hint: 'Piper WAV • POST /api/tts' },
  { id: 'opencode', name: 'OpenCode', hint: 'Catalog persona • system engine' },
];

export const DEFAULT_STT_SOURCE: VoiceSttSource = 'browser';

export const DEFAULT_TTS_SOURCE: VoiceTtsSource = 'opencode';

/** Mirrors the server PIPER_MAX_TEXT cap (packages/tts) for early input trim. */
export const SERVER_TTS_TEXT_CAP = 2000;

export const DEFAULT_STT_MODEL_ID = 'muse-spark-1.3';

export const DEFAULT_TTS_VOICE_ID = 'muse-spark-1.3-aria';

export const DEFAULT_DUPLEX_MODEL_ID = 'opencode-go/muse-spark-1.3-contributor';

/** Preferred live duplex engine — wins over the server default map when present. */
export const PREFERRED_DUPLEX_MODEL = {
  providerId: 'opencode-go',
  modelId: 'muse-spark-1.3-contributor',
} as const;

export const DEFAULT_LANGUAGE = 'en-US';

export const DEFAULT_TTS_TEXT =
  'Welcome to Vestara Clinical Notes AI. Your intelligent operating system for behavioral health documentation. Ambient scribe with 99 languages, 36 plus EHR integrations, and real-time compliance checking.';

export const STREAM_PHRASES: string[] = [
  'Can you tell me how you have been sleeping this week?',
  'Not well, maybe 4 hours, lots of racing thoughts.',
  'I hear that is distressing. Have you been able to use coping skills?',
  'I tried grounding, it helped a bit in the moment.',
  'That is great progress on treatment plan goal number two.',
];

export const STREAM_CONFIG_ROWS = [
  { key: 'LATENCY', label: 'Latency' },
  { key: 'RETENTION', label: 'Zero Retention' },
  { key: 'QUEUE', label: 'Offline Queue' },
] as const;

export interface AudioPipelineStep {
  id: string;
  label: string;
}

export const AUDIO_PIPELINE: AudioPipelineStep[] = [
  { id: 'capture', label: 'Mic → VAD → Noise Suppression → Muse Spark STT' },
  { id: 'note', label: 'STT → DNA Layer → Muse Spark → SOAP/BIRP' },
  { id: 'synth', label: 'Muse Spark → SSML → TTS Streaming → Audio' },
  { id: 'duplex', label: 'Duplex: Barge-in • Echo Cancel • Turn-taking' },
];

export const CLINICAL_INTEGRATIONS: string[] = [
  'Live session STT → Transcript → SOAP 15-45s',
  'Dictation STT → Post-session note',
  'Group attribution per-member STT',
  'Supervise practice patients TTS (MI/CBT/DBT)',
  'Front Door AI receptionist Duplex',
  'Offline queue • No audio retained',
];

export const VOICE_FOOTER_STATS = [
  { value: '15-45s', label: 'STT→Note' },
  { value: '89ms', label: 'TTS first byte' },
  { value: '99', label: 'langs' },
] as const;

export const VOICE_COMPLIANCE_NOTE =
  'HIPAA • SOC2 Type II • Zero Data Retention • US-based • BAA • FERPA • 42 CFR Part 2 • No audio retained • Glass box';

export const VOICE_EMPTY_TRANSCRIPT =
  'Press Record to start streaming STT • Muse Spark 1.3 • 99 languages • Interim results • Group attribution • Offline capable';
