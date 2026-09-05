/**
 * @vestara/voice-browser — Voice Browser Pipeline
 *
 * The complete audio stream flow for voice-driven web browsing:
 *
 *   Mic → AudioStream → VAD (speech detection) → STT (transcription)
 *   → IntentParser (command parsing) → BrowserAutomation (action execution)
 *   → ActionRenderer (visual feedback) → Speaker (audio confirmation)
 *
 * This is the main entrypoint. It wires together the existing
 * @vestara/audio, @vestara/stt packages with the browser automation
 * engine and visual renderer.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Voice-Driven Web Navigation
 */

import { VestaraAudioService } from '@vestara/audio';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { VestaraSTTService } from '@vestara/stt';
import { EventBusActionRenderer, TerminalActionRenderer } from './action-renderer.js';
import { type PlaywrightBrowserEngine, StubBrowserEngine } from './browser-automation-engine.js';
import type {
  ActionResult,
  BrowserAction,
  BrowserEngine,
  PipelineConfig,
  PipelineEvent,
  PipelineState,
  VisualOverlay,
} from './types.js';
import { intentToAction, parseVoiceIntent } from './voice-intent-parser.js';

export interface VoiceBrowserPipeline {
  readonly state: PipelineState;
  readonly isListening: boolean;
  readonly currentUrl: string | undefined;

  start(): Promise<void>;
  stop(): Promise<void>;
  executeVoiceCommand(text: string): Promise<void>;
  executeAction(action: BrowserAction): Promise<void>;
  getOverlay(): VisualOverlay;
}

interface PipelineOptions {
  config?: PipelineConfig;
  logger?: Logger;
  eventBus?: EventBus;
  browserEngine?: BrowserEngine;
}

/**
 * Unified renderer interface shared by both Terminal and EventBus renderers.
 */
interface UnifiedRenderer {
  renderAction(action: BrowserAction, result?: ActionResult): unknown;
  renderListening(isListening: boolean): void | Promise<void>;
  renderTranscription(text: string, isFinal: boolean): void | Promise<void>;
  renderProcessing(isProcessing: boolean): void | Promise<void>;
  renderError(message: string): void;
  updateUrl(url: string): void | Promise<void>;
  getOverlay(): VisualOverlay;
  clear(): void;
}

function wrapRenderer(renderer: TerminalActionRenderer | EventBusActionRenderer): UnifiedRenderer {
  if (renderer instanceof EventBusActionRenderer) {
    return {
      renderAction: (a, r) => renderer.renderAction(a, r),
      renderListening: (v) => renderer.renderListening(v),
      renderTranscription: (t, f) => renderer.renderTranscription(t, f),
      renderProcessing: (v) => renderer.renderProcessing(v),
      renderError: (m) => renderer.renderError(m),
      updateUrl: (u) => renderer.updateUrl(u),
      getOverlay: () => renderer.getOverlay(),
      clear: () => renderer.clear(),
    };
  }
  return renderer;
}

export class DefaultVoiceBrowserPipeline implements VoiceBrowserPipeline {
  private _state: PipelineState = 'idle';
  private _isListening = false;
  private _currentUrl: string | undefined;
  private audio: VestaraAudioService;
  private stt: VestaraSTTService;
  private browser: BrowserEngine;
  private renderer: UnifiedRenderer;
  private config: PipelineConfig;
  private logger?: Logger;
  private eventBus?: EventBus;
  private eventHistory: PipelineEvent[] = [];

  constructor(options: PipelineOptions) {
    this.config = {
      language: 'en',
      autoScroll: true,
      visualFeedbackEnabled: true,
      maxConcurrentActions: 1,
      actionTimeoutMs: 10_000,
      screenshotOnAction: false,
      ...options.config,
    };
    this.logger = options.logger;
    this.eventBus = options.eventBus;

    // Audio pipeline
    this.audio = new VestaraAudioService({ logger: this.logger });

    // STT pipeline
    this.stt = new VestaraSTTService({ logger: this.logger });

    // Browser engine
    this.browser = options.browserEngine ?? new StubBrowserEngine();

    // Visual renderer — wrap in unified interface
    if (options.eventBus) {
      this.renderer = wrapRenderer(new EventBusActionRenderer(options.eventBus, { logger: this.logger }));
    } else {
      this.renderer = wrapRenderer(new TerminalActionRenderer({ logger: this.logger }));
    }
  }

  get state(): PipelineState {
    return this._state;
  }

  get isListening(): boolean {
    return this._isListening;
  }

  get currentUrl(): string | undefined {
    return this._currentUrl;
  }

  /**
   * Starts the pipeline: initializes browser, audio, and begins listening.
   */
  async start(): Promise<void> {
    this.logger?.info('Starting voice browser pipeline');
    this._setState('listening');
    this._isListening = true;

    // Initialize browser engine
    if ('initialize' in this.browser) {
      await (this.browser as PlaywrightBrowserEngine).initialize();
    }

    // Start audio capture
    try {
      await this.audio.startCapture({ sampleRate: 16_000, channels: 1, bitDepth: 16 });
      this._emitEvent('pipeline:started', {});
    } catch {
      this.logger?.warn('Audio capture not available, voice commands via text only');
    }

    this.logger?.info('Voice browser pipeline ready');
  }

  /**
   * Stops the pipeline: stops audio, closes browser.
   */
  async stop(): Promise<void> {
    this._isListening = false;
    this._setState('idle');
    await this.audio.stopCapture();
    await this.browser.close();
    this._emitEvent('pipeline:stopped', {});
    this.logger?.info('Voice browser pipeline stopped');
  }

  /**
   * Executes a voice command from transcribed text.
   * This is the main entry point for the audio stream flow.
   */
  async executeVoiceCommand(text: string): Promise<void> {
    // 1. Transcribe → Intent
    this._setState('transcribing');
    this._emitEvent('voice:transcribed', { text });

    await this.renderer.renderTranscription(text, false);

    // 2. Parse intent
    this._setState('parsing_intent');
    const intent = parseVoiceIntent(text);
    this._emitEvent('intent:parsed', { intent });

    if (intent.type === 'unknown') {
      this.renderer.renderError(`Unknown command: "${text}"`);
      this._setState('idle');
      return;
    }

    // 3. Convert to browser action
    const action = intentToAction(intent);
    this._emitEvent('action:derived', { action });

    await this.renderer.renderTranscription(text, true);

    // 4. Execute action with visual feedback
    await this.executeAction(action);
  }

  /**
   * Executes a browser action with full visual feedback.
   */
  async executeAction(action: BrowserAction): Promise<void> {
    this._setState('executing_action');
    this._emitEvent('action:executing', { action });

    // Render the action visually
    await Promise.resolve(this.renderer.renderAction(action));

    // Execute on the browser engine
    let result;
    try {
      result = await this._executeBrowserAction(action);
    } catch (error) {
      result = {
        success: false,
        action,
        error: error instanceof Error ? error.message : 'Action failed',
        duration: 0,
      };
    }

    // Update visual feedback with result
    await Promise.resolve(this.renderer.renderAction(action, result));

    // Update URL if navigation happened
    if (action.type === 'navigate' && result.success) {
      this._currentUrl = action.value;
      await Promise.resolve(this.renderer.updateUrl(action.value ?? ''));
    }

    // Auto-screenshot after action if enabled
    if (this.config.screenshotOnAction && result.success) {
      const screenshot = await this.browser.screenshot();
      if (screenshot) {
        this._emitEvent('action:screenshot', { screenshot });
      }
    }

    this._emitEvent('action:completed', { action, result });
    this._setState('idle');
  }

  /**
   * Returns the current visual overlay state.
   */
  getOverlay() {
    return this.renderer.getOverlay();
  }

  // ─── Private ────────────────────────────────────────────────

  private async _executeBrowserAction(action: BrowserAction) {
    const timeout = this.config.actionTimeoutMs ?? 10_000;
    const execute = async () => {
      switch (action.type) {
        case 'navigate':
          return this.browser.navigate(action.value ?? '');
        case 'click':
          return this.browser.click(action.selector ?? action.target ?? '');
        case 'type':
          return this.browser.type(action.target ?? 'body', action.value ?? '');
        case 'scroll':
          return this.browser.scroll(action.scrollDirection ?? 'down', action.scrollAmount);
        case 'go_back':
          return this.browser.goBack();
        case 'go_forward':
          return this.browser.goForward();
        case 'reload':
          return this.browser.reload();
        case 'screenshot': {
          await this.browser.screenshot();
          return {
            success: true,
            action,
            duration: 0,
          };
        }
        case 'extract_text': {
          const text = await this.browser.getText(action.selector);
          return {
            success: true,
            action,
            extractedText: text,
            duration: 0,
          };
        }
        default:
          return {
            success: false,
            action,
            error: `Unsupported action: ${action.type}`,
            duration: 0,
          };
      }
    };

    return Promise.race([
      execute(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Action timed out after ${timeout}ms`)), timeout),
      ),
    ]);
  }

  private _setState(state: PipelineState): void {
    const prev = this._state;
    this._state = state;
    if (prev !== state) {
      this._emitEvent('pipeline:state', { from: prev, to: state });
    }
  }

  private _emitEvent(type: string, data: Record<string, unknown>): void {
    const event: PipelineEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.eventHistory.push(event);
    if (this.eventHistory.length > 200) {
      this.eventHistory = this.eventHistory.slice(-100);
    }

    if (this.eventBus) {
      this.eventBus
        .emit({
          type: `voice-browser:${type}`,
          source: 'voice-browser',
          payload: data,
        })
        .catch(() => {});
    }
  }
}
