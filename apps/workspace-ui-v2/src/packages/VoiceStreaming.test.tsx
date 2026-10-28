/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceStreamingPkg } from './VoiceStreaming';
import { STT_MODELS, TTS_VOICES } from './voice-streaming.fixtures';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: unknown) => handler(String(url), init as RequestInit | undefined)),
  );
}

class FakeComponentRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  stopped = 0;

  constructor() {
    createdRecognitions.push(this);
  }

  start() {}

  stop() {
    this.stopped += 1;
  }

  emitResult(payload: unknown) {
    this.onresult?.(payload);
  }
}

const createdRecognitions: FakeComponentRecognition[] = [];

class FakeComponentUtterance {
  text: string;
  lang = '';
  volume = 1;
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  onend: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onboundary: ((event: { charIndex: number }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('VoiceStreamingPkg', () => {
  it('renders the voice streaming header with all three modes', () => {
    render(<VoiceStreamingPkg />);
    expect(screen.getByText('VOICE STREAMING')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /stt/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /tts/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /duplex/i })).toBeTruthy();
  });

  it('lists every STT model and TTS voice from fixtures', () => {
    render(<VoiceStreamingPkg />);
    for (const m of STT_MODELS) expect(screen.getByText(m.name)).toBeTruthy();
    for (const v of TTS_VOICES) expect(screen.getByText(v.name)).toBeTruthy();
  });

  it('shows the empty-transcript hint and stream metrics', () => {
    render(<VoiceStreamingPkg />);
    expect(screen.getByText(/Press Record to start streaming STT/i)).toBeTruthy();
    expect(screen.getByText('STREAM METRICS')).toBeTruthy();
    expect(screen.getByText('AUDIO PIPELINE')).toBeTruthy();
    expect(screen.getByText('CLINICAL NOTES INTEGRATION')).toBeTruthy();
  });

  it('toggles recording state from the Record button', () => {
    render(<VoiceStreamingPkg />);
    const record = screen.getByRole('button', { name: /record/i });
    fireEvent.click(record);
    expect(screen.getByRole('button', { name: /stop/i })).toBeTruthy();
  });

  it('switches to TTS mode and exposes the synthesis input', () => {
    render(<VoiceStreamingPkg />);
    fireEvent.click(screen.getByRole('tab', { name: /tts/i }));
    expect(screen.getByLabelText('Text to synthesize')).toBeTruthy();
    expect(screen.getByRole('button', { name: /stream tts/i })).toBeTruthy();
  });

  it('switches to duplex mode and shows the conversation loop card', () => {
    render(<VoiceStreamingPkg />);
    fireEvent.click(screen.getByRole('tab', { name: /duplex/i }));
    expect(screen.getByText(/DUPLEX MODE/i)).toBeTruthy();
  });

  it('overlays the live OpenCode audio catalog when reachable', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/opencode/config/providers')) {
        return ok({
          providers: [
            {
              id: 'opencode',
              name: 'OpenCode',
              models: [
                {
                  id: 'muse-spark-1.3-audio',
                  name: 'Muse Spark 1.3 Audio',
                  family: 'muse-spark',
                  capabilities: { input: { audio: true }, output: { audio: true } },
                },
                {
                  id: 'muse-spark-1.2-voice',
                  name: 'Muse Spark 1.2 Voice',
                  family: 'muse-spark',
                  capabilities: { input: { text: true }, output: { audio: true } },
                },
              ],
            },
          ],
          default: { model: 'opencode/muse-spark-1.3-audio' },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    // Live audio models replace the fixture lists (the audio in+out model
    // appears in both the STT and the TTS sections)…
    expect(screen.getAllByText('Muse Spark 1.3 Audio')).toHaveLength(2);
    expect(screen.getByText('Muse Spark 1.2 Voice')).toBeTruthy();
    expect(screen.queryByText('Muse Spark 1.3 • Streaming')).toBeNull();
    // …and the server default becomes the duplex engine.
    expect(screen.getByText('opencode/muse-spark-1.3-audio')).toBeTruthy();
  });

  it('streams live transcript rows from the browser recognition engine', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    createdRecognitions.length = 0;
    vi.stubGlobal('SpeechRecognition', FakeComponentRecognition);
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(screen.getByText('Web Speech • live')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    const rec = createdRecognitions[createdRecognitions.length - 1];
    expect(rec).toBeTruthy();
    expect(rec.lang).toBe('en-US');
    await act(async () => {
      rec.emitResult({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: 'hello the', confidence: 0.7 } }],
      });
    });
    expect(screen.getByText('hello the')).toBeTruthy();
    expect(screen.getByText('Interim')).toBeTruthy();
    await act(async () => {
      rec.emitResult({
        resultIndex: 1,
        results: [
          { isFinal: false, 0: { transcript: 'hello the', confidence: 0.7 } },
          { isFinal: true, 0: { transcript: 'hello there', confidence: 0.93 } },
        ],
      });
    });
    expect(screen.getByText('hello there')).toBeTruthy();
    expect(screen.queryByText('Interim')).toBeNull();
    expect(screen.getByText('Final')).toBeTruthy();
  });

  it('speaks through the system synthesis engine with mapped voice params', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    vi.stubGlobal('SpeechSynthesisUtterance', FakeComponentUtterance);
    const spoken: FakeComponentUtterance[] = [];
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((u: FakeComponentUtterance) => {
        spoken.push(u);
      }),
      getVoices: () => [{ name: 'Google US English', lang: 'en-US', default: true }],
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(await screen.findByText(/System • 1 voices/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /tts/i }));
    fireEvent.click(screen.getByRole('button', { name: /stream tts/i }));
    await act(async () => {});
    expect(spoken).toHaveLength(1);
    expect(spoken[0].volume).toBeCloseTo(0.85);
    expect(spoken[0].rate).toBe(1);
    expect(spoken[0].pitch).toBeCloseTo(1);
    expect(spoken[0].lang).toBe('en-US');
    await act(async () => {
      spoken[0].onend?.({});
    });
    expect(screen.getByRole('button', { name: /stream tts/i })).toBeTruthy();
  });

  it('loops a duplex turn: final utterance → assistant reply → spoken back', async () => {
    const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
    const frame = (event: unknown) => ({
      schemaVersion: 1,
      conversationId: 'c1',
      messageId: 'm',
      sequence: 0,
      timestamp: 't',
      event,
    });
    stubFetch(async (url, init) => {
      if (url.startsWith('/api/opencode/config/providers')) throw new Error('down');
      if (url === '/api/conversations' && init?.method === 'POST') return ok({ conversation: { id: 'c1' } });
      if (url === '/api/conversations/c1/stream') {
        return new Response(
          sse([
            frame({ type: 'delta', content: 'Hi ' }),
            frame({ type: 'delta', content: 'there' }),
            frame({ type: 'done' }),
          ]),
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    createdRecognitions.length = 0;
    vi.stubGlobal('SpeechRecognition', FakeComponentRecognition);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeComponentUtterance);
    const spoken: FakeComponentUtterance[] = [];
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((u: FakeComponentUtterance) => {
        spoken.push(u);
      }),
      getVoices: () => [{ name: 'Google US English', lang: 'en-US', default: true }],
    });
    localStorage.setItem('vestara-assistant-token', 'test-token');
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /duplex/i }));
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    const rec = createdRecognitions[createdRecognitions.length - 1];
    await act(async () => {
      rec.emitResult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'hello', confidence: 0.95 } }],
      });
    });
    // Assistant streams its reply into the transcript…
    expect(await screen.findByText('Hi there')).toBeTruthy();
    expect(screen.getByText('Assistant')).toBeTruthy();
    // …and the completed turn is spoken back through the TTS engine.
    await screen.findByText('Speaking');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe('Hi there');
    await act(async () => {
      spoken[0].onend?.({});
    });
    expect(screen.queryByText('Speaking')).toBeNull();
  });

  it('skips overlapping duplex turns while a reply is speaking', async () => {
    const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
    const frame = (event: unknown) => ({
      schemaVersion: 1,
      conversationId: 'c1',
      messageId: 'm',
      sequence: 0,
      timestamp: 't',
      event,
    });
    const streamCalls: string[] = [];
    stubFetch(async (url, init) => {
      if (url.startsWith('/api/opencode/config/providers')) throw new Error('down');
      if (url === '/api/conversations' && init?.method === 'POST') return ok({ conversation: { id: 'c1' } });
      if (url === '/api/conversations/c1/stream') {
        streamCalls.push(url);
        return new Response(
          sse([
            frame({ type: 'delta', content: 'Hi ' }),
            frame({ type: 'delta', content: 'there' }),
            frame({ type: 'done' }),
          ]),
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    createdRecognitions.length = 0;
    vi.stubGlobal('SpeechRecognition', FakeComponentRecognition);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeComponentUtterance);
    const spoken: FakeComponentUtterance[] = [];
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((u: FakeComponentUtterance) => {
        spoken.push(u);
      }),
      getVoices: () => [{ name: 'Google US English', lang: 'en-US', default: true }],
    });
    localStorage.setItem('vestara-assistant-token', 'test-token');
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /duplex/i }));
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    const rec = createdRecognitions[createdRecognitions.length - 1];
    await act(async () => {
      rec.emitResult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: 'one', confidence: 0.95 } }],
      });
    });
    expect(await screen.findByText('Hi there')).toBeTruthy();
    await screen.findByText('Speaking');
    expect(streamCalls).toHaveLength(1);
    // A second utterance while the reply is still speaking starts no new turn…
    await act(async () => {
      rec.emitResult({
        resultIndex: 1,
        results: [
          { isFinal: true, 0: { transcript: 'one', confidence: 0.95 } },
          { isFinal: true, 0: { transcript: 'two', confidence: 0.95 } },
        ],
      });
    });
    await act(async () => {});
    expect(streamCalls).toHaveLength(1);
    expect(spoken).toHaveLength(1);
    // …but once speech ends the loop accepts turns again.
    await act(async () => {
      spoken[0].onend?.({});
    });
    await act(async () => {
      rec.emitResult({
        resultIndex: 2,
        results: [
          { isFinal: true, 0: { transcript: 'one', confidence: 0.95 } },
          { isFinal: true, 0: { transcript: 'two', confidence: 0.95 } },
          { isFinal: true, 0: { transcript: 'three', confidence: 0.95 } },
        ],
      });
    });
    await screen.findByText('Speaking');
    expect(streamCalls).toHaveLength(2);
    expect(spoken).toHaveLength(2);
  });

  it('prefers opencode-go/muse-spark-1.3-contributor as the live duplex engine', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/opencode/config/providers')) {
        return ok({
          providers: [
            {
              id: 'opencode-go',
              name: 'OpenCode Go',
              models: [
                {
                  id: 'muse-spark-1.3-contributor',
                  name: 'Muse Spark 1.3 Contributor',
                  family: 'muse-spark',
                  capabilities: { input: { audio: true }, output: { audio: true } },
                },
              ],
            },
          ],
          default: { 'opencode-go': 'gpt-5.6-luna' },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect(screen.getByText('opencode-go/muse-spark-1.3-contributor')).toBeTruthy();
  });

  it('falls back to the fixture catalog with a SNAPSHOT pill when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(screen.getByText('Muse Spark 1.3 • Streaming')).toBeTruthy();
  });

  it('offers the fixture voice provider with all models visible by default', () => {
    render(<VoiceStreamingPkg />);
    expect(screen.getByText('VOICE PROVIDER')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Voice provider filter: All providers' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Voice provider filter: OpenCode' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Voice provider filter: OpenCode' }));
    for (const m of STT_MODELS) expect(screen.getByText(m.name)).toBeTruthy();
    for (const v of TTS_VOICES) expect(screen.getByText(v.name)).toBeTruthy();
  });

  it('exposes the STT/TTS engine picker with Browser/OpenCode defaults', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(screen.getByText('VOICE ENGINE')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'STT source engine: Browser' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'TTS source engine: OpenCode' }) as HTMLInputElement).checked).toBe(true);
    // No server binaries here — the Whisper/Piper options stay disabled and
    // surface the server-reported reason instead of failing silently.
    await waitFor(() => {
      expect((screen.getByRole('radio', { name: 'STT source engine: Whisper' }) as HTMLInputElement).disabled).toBe(
        true,
      );
      expect((screen.getByRole('radio', { name: 'TTS source engine: Server' }) as HTMLInputElement).disabled).toBe(
        true,
      );
    });
    expect(screen.getByText('STT Source')).toBeTruthy();
    expect(screen.getByText('TTS Source')).toBeTruthy();
  });

  it('records through Whisper and appends the server transcript on stop', async () => {
    // No assistant token → the WS live path is skipped, batch upload runs.
    localStorage.removeItem('vestara-assistant-token');
    class FakeRecorder {
      static instances: FakeRecorder[] = [];

      state = 'inactive';

      ondataavailable: ((event: { data: Blob }) => void) | null = null;

      onstop: (() => void) | null = null;

      mimeType = 'audio/webm';

      constructor(public stream: unknown) {
        FakeRecorder.instances.push(this);
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    FakeRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
      configurable: true,
    });
    stubFetch(async (url) => {
      if (url.startsWith('/api/voice/models')) {
        return ok({
          sttEngines: [{ id: 'whisper', name: 'Whisper', available: true, detail: 'ready' }],
          ttsEngines: [],
          ttsVoices: [],
        });
      }
      if (url.startsWith('/api/stt')) return ok({ text: 'server hello', confidence: 0.95, duration: 1 });
      throw new Error(`unexpected ${url}`);
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    const whisper = screen.getByRole('radio', { name: 'STT source engine: Whisper' });
    await waitFor(() => expect((whisper as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(whisper);
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    await waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(await screen.findByText('server hello')).toBeTruthy();
  });

  it('drops empty live results instead of blanking the transcript', async () => {
    class FakeEmptySocket {
      static instances: FakeEmptySocket[] = [];

      url: string;

      readyState = 0;

      onopen: (() => void) | null = null;

      onmessage: ((event: { data: string }) => void) | null = null;

      onerror: (() => void) | null = null;

      onclose: ((event: { code: number }) => void) | null = null;

      sent: string[] = [];

      closed: { code: number } | null = null;

      constructor(url: string) {
        this.url = url;
        FakeEmptySocket.instances.push(this);
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(code = 1000): void {
        this.readyState = 3;
        this.closed = { code };
        this.onclose?.({ code });
      }

      open(): void {
        this.readyState = 1;
        this.onopen?.();
      }

      receive(message: unknown): void {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }
    FakeEmptySocket.instances = [];
    vi.stubGlobal('WebSocket', FakeEmptySocket);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
      configurable: true,
    });
    class FakeEmptyAudioContext {
      sampleRate = 48000;

      destination = {};

      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });

      createAnalyser = () => ({ fftSize: 0, frequencyBinCount: 4, getByteFrequencyData: vi.fn() });

      createScriptProcessor = () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null });

      createGain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } });

      resume = async () => {};

      close = async () => {};
    }
    Object.defineProperty(window, 'AudioContext', { value: FakeEmptyAudioContext, configurable: true });
    stubFetch(async (url) => {
      if (url.startsWith('/api/voice/models')) {
        return ok({
          sttEngines: [{ id: 'whisper', name: 'Whisper', available: true, detail: 'ready' }],
          ttsEngines: [],
          ttsVoices: [],
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    localStorage.setItem('vestara-assistant-token', 'test-token');
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    const whisper = screen.getByRole('radio', { name: 'STT source engine: Whisper' });
    await waitFor(() => expect((whisper as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(whisper);
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    await waitFor(() => expect(FakeEmptySocket.instances).toHaveLength(1));
    const live = FakeEmptySocket.instances[0];
    live.open();
    live.receive({ op: 'voice.ready', sessionId: 's1', engine: 'whisper-chunked' });
    expect(await screen.findByText('Whisper live • WS streaming')).toBeTruthy();
    // Empty interim creates no row; an empty final neither blanks nor appends.
    live.receive({ op: 'voice.partial', text: '   ' });
    live.receive({ op: 'voice.final', text: '', confidence: 0 });
    await act(async () => {});
    expect(screen.getByText(/Press Record to start streaming STT/)).toBeTruthy();
    expect(screen.queryByText('Interim')).toBeNull();
    expect(screen.queryByText('Final')).toBeNull();
    // A real final afterwards still lands normally.
    live.receive({ op: 'voice.final', text: 'hello there', confidence: 0.95 });
    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
  });

  it('streams Whisper utterances live over the voice socket', async () => {
    class FakeLiveSocket {
      static instances: FakeLiveSocket[] = [];

      url: string;

      readyState = 0;

      onopen: (() => void) | null = null;

      onmessage: ((event: { data: string }) => void) | null = null;

      onerror: (() => void) | null = null;

      onclose: ((event: { code: number }) => void) | null = null;

      sent: string[] = [];

      closed: { code: number } | null = null;

      constructor(url: string) {
        this.url = url;
        FakeLiveSocket.instances.push(this);
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(code = 1000): void {
        this.readyState = 3;
        this.closed = { code };
        this.onclose?.({ code });
      }

      open(): void {
        this.readyState = 1;
        this.onopen?.();
      }

      receive(message: unknown): void {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }
    FakeLiveSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeLiveSocket);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
      configurable: true,
    });
    const processors: Array<{ onaudioprocess: ((event: unknown) => void) | null }> = [];
    // Class, not vi.fn(arrow): the component news the constructor up, and
    // the formatter rewrites function-returning-literals into arrows.
    class FakeAudioContext {
      sampleRate = 48000;

      destination = {};

      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });

      createAnalyser = () => ({ fftSize: 0, frequencyBinCount: 4, getByteFrequencyData: vi.fn() });

      createScriptProcessor = () => {
        const processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
        processors.push(processor as { onaudioprocess: ((event: unknown) => void) | null });
        return processor;
      };

      createGain = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } });

      resume = async () => {};

      close = async () => {};
    }
    Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
    stubFetch(async (url) => {
      if (url.startsWith('/api/voice/models')) {
        return ok({
          sttEngines: [{ id: 'whisper', name: 'Whisper', available: true, detail: 'ready' }],
          ttsEngines: [],
          ttsVoices: [],
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    localStorage.setItem('vestara-assistant-token', 'test-token');
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    const whisper = screen.getByRole('radio', { name: 'STT source engine: Whisper' });
    await waitFor(() => expect((whisper as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(whisper);
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    await waitFor(() => expect(FakeLiveSocket.instances).toHaveLength(1));
    const live = FakeLiveSocket.instances[0];
    expect(live.url).toContain('/ws/voice?token=test-token');
    live.open();
    live.receive({ op: 'voice.ready', sessionId: 's1', engine: 'whisper-chunked' });
    expect(await screen.findByText('Whisper live • WS streaming')).toBeTruthy();
    // Live PCM in → interim row streams; final resolves it.
    processors[0].onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.2) } });
    live.receive({ op: 'voice.partial', text: 'hel' });
    expect(await screen.findByText('hel')).toBeTruthy();
    expect(screen.getByText('Interim')).toBeTruthy();
    live.receive({ op: 'voice.final', text: 'hello there', confidence: 0.95 });
    expect(await screen.findByText('hello there')).toBeTruthy();
    expect(screen.queryByText('Interim')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    await waitFor(() => {
      expect(live.sent.map((s) => JSON.parse(s).op)).toContain('voice.stop');
    });
    live.receive({ op: 'voice.stopped' });
    await waitFor(() => expect(live.closed?.code).toBe(1000));
  });

  it('falls back to batch upload when the live socket fails', async () => {
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor(public url: string) {
          throw new Error('no socket here');
        }
      },
    );
    class FakeFallbackRecorder {
      static instances: FakeFallbackRecorder[] = [];

      state = 'inactive';

      ondataavailable: ((event: { data: Blob }) => void) | null = null;

      onstop: (() => void) | null = null;

      mimeType = 'audio/webm';

      constructor(public stream: unknown) {
        FakeFallbackRecorder.instances.push(this);
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    FakeFallbackRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeFallbackRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
      configurable: true,
    });
    stubFetch(async (url) => {
      if (url.startsWith('/api/voice/models')) {
        return ok({
          sttEngines: [{ id: 'whisper', name: 'Whisper', available: true, detail: 'ready' }],
          ttsEngines: [],
          ttsVoices: [],
        });
      }
      if (url.startsWith('/api/stt')) return ok({ text: 'batch fallback', confidence: 0.9, duration: 1 });
      throw new Error(`unexpected ${url}`);
    });
    localStorage.setItem('vestara-assistant-token', 'test-token');
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    const whisper = screen.getByRole('radio', { name: 'STT source engine: Whisper' });
    await waitFor(() => expect((whisper as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(whisper);
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }));
    await waitFor(() => expect(FakeFallbackRecorder.instances).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(await screen.findByText('batch fallback')).toBeTruthy();
  });

  it('lists Piper voices when the Server TTS source is selected', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/voice/models')) {
        return ok({
          sttEngines: [],
          ttsEngines: [{ id: 'server', name: 'Piper (server)', available: true, detail: 'ready' }],
          ttsVoices: [{ id: 'en-voice', name: 'English Piper', lang: 'en-US' }],
        });
      }
      throw new Error('down');
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    const server = screen.getByRole('radio', { name: 'TTS source engine: Server' });
    await waitFor(() => expect((server as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(server);
    expect(await screen.findByText('English Piper')).toBeTruthy();
  });

  it('renders same-id models from different providers without duplicate keys', async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    try {
      const voice = (id: string, name: string) => ({
        id,
        name,
        family: 'f',
        capabilities: { input: { audio: true }, output: { audio: true } },
      });
      stubFetch(async (url) => {
        if (url.startsWith('/api/voice/models')) return ok({ sttEngines: [], ttsEngines: [], ttsVoices: [] });
        if (url.startsWith('/api/opencode/config/providers')) {
          return ok({
            providers: [
              { id: 'opencode', name: 'OpenCode', models: [voice('gemini-4-argon', 'Argon • OpenCode')] },
              { id: 'acme', name: 'Acme', models: [voice('gemini-4-argon', 'Argon • Acme')] },
            ],
            default: {},
          });
        }
        throw new Error(`unexpected ${url}`);
      });
      render(<VoiceStreamingPkg />);
      expect(await screen.findByText('LIVE')).toBeTruthy();
      // Both provider rows survive in the unfiltered view…
      expect(screen.getAllByText('Argon • OpenCode')).toHaveLength(2);
      expect(screen.getAllByText('Argon • Acme')).toHaveLength(2);
      // …and no duplicate-key warning was emitted.
      expect(errors.flat().join(' ')).not.toContain('same key');
    } finally {
      spy.mockRestore();
    }
  });

  it('filters the model lists by live voice provider', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/opencode/config/providers')) {
        return ok({
          providers: [
            {
              id: 'opencode',
              name: 'OpenCode',
              models: [
                {
                  id: 'muse-spark-1.3-audio',
                  name: 'Muse Spark 1.3 Audio',
                  family: 'muse-spark',
                  capabilities: { input: { audio: true }, output: { audio: true } },
                },
              ],
            },
            {
              id: 'acme',
              name: 'Acme',
              models: [
                {
                  id: 'acme-voice-1',
                  name: 'Acme Voice 1',
                  family: 'acme-voice',
                  capabilities: { input: { audio: true }, output: { audio: true } },
                },
              ],
            },
          ],
          default: {},
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    render(<VoiceStreamingPkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Voice provider filter: Acme' }));
    expect(screen.queryByText('Muse Spark 1.3 Audio')).toBeNull();
    expect(screen.getAllByText('Acme Voice 1')).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: 'Voice provider filter: All providers' }));
    expect(screen.getAllByText('Muse Spark 1.3 Audio')).toHaveLength(2);
    expect(screen.getAllByText('Acme Voice 1')).toHaveLength(2);
  });
});
