/**
 * @vestara/voice-browser — Action Renderer
 *
 * Renders visual feedback for browser actions. Shows on-screen overlays
 * indicating what the voice system is doing: navigating, typing, clicking,
 * scrolling, etc. Can output to a terminal (TUI), a web overlay, or
 * event bus for the Workspace UI.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Visual Action Feedback
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ActionResult, BrowserAction, VisualAction, VisualActionType, VisualOverlay } from './types.js';

// ─── Visual Action Icons ──────────────────────────────────────

const ACTION_ICONS: Record<VisualActionType, string> = {
  navigating: '🌐',
  typing: '⌨️',
  clicking: '🖱️',
  scrolling: '📜',
  loading: '⏳',
  extracting: '📋',
  error: '❌',
  success: '✅',
  listening: '🎤',
  processing_voice: '🧠',
  transcribing: '📝',
};

// ─── Action Visual Mapper ─────────────────────────────────────

function actionToVisual(action: BrowserAction, result?: ActionResult): VisualAction {
  const base: VisualAction = {
    type: mapActionType(action),
    label: formatLabel(action),
    timestamp: Date.now(),
    duration: result?.duration,
    target: action.target ?? action.selector,
    selector: action.selector,
  };
  return base;
}

function mapActionType(action: BrowserAction): VisualActionType {
  switch (action.type) {
    case 'navigate':
      return 'navigating';
    case 'click':
      return 'clicking';
    case 'type':
      return 'typing';
    case 'scroll':
      return 'scrolling';
    case 'extract_text':
      return 'extracting';
    case 'screenshot':
      return 'extracting';
    default:
      return 'success';
  }
}

function formatLabel(action: BrowserAction): string {
  switch (action.type) {
    case 'navigate':
      return `Navigating to ${action.value}`;
    case 'click':
      return `Clicking ${action.selector ?? action.target ?? 'element'}`;
    case 'type':
      return `Typing "${action.value}"`;
    case 'scroll':
      return `Scrolling ${action.scrollDirection ?? 'down'}`;
    case 'go_back':
      return 'Going back';
    case 'go_forward':
      return 'Going forward';
    case 'reload':
      return 'Reloading page';
    case 'extract_text':
      return 'Extracting page text';
    case 'screenshot':
      return 'Taking screenshot';
    default:
      return `Executing ${action.type}`;
  }
}

// ─── Terminal Renderer ────────────────────────────────────────

export class TerminalActionRenderer {
  private actions: VisualAction[] = [];
  private isListening = false;
  private isProcessing = false;
  private currentUrl?: string;
  private transcription?: string;
  private logger?: Logger;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'action-renderer' });
  }

  /**
   * Renders a visual action to the terminal as a formatted overlay line.
   */
  renderAction(action: BrowserAction, result?: ActionResult): VisualAction {
    const visual = actionToVisual(action, result);
    this.actions.push(visual);
    if (this.actions.length > 100) {
      this.actions = this.actions.slice(-50);
    }

    const icon = ACTION_ICONS[visual.type];
    const status = result?.success === false ? ' ❌' : '';
    const duration = visual.duration ? ` (${visual.duration}ms)` : '';
    const line = `  ${icon} ${visual.label}${duration}${status}`;

    this.logger?.info(line);
    return visual;
  }

  /**
   * Renders the listening state.
   */
  renderListening(isListening: boolean): void {
    this.isListening = isListening;
    const icon = isListening ? ACTION_ICONS.listening : '🔇';
    const state = isListening ? 'LISTENING' : 'IDLE';
    this.logger?.info(`  ${icon} Voice ${state}`);
  }

  /**
   * Renders transcription progress.
   */
  renderTranscription(text: string, isFinal: boolean): void {
    this.transcription = text;
    const icon = ACTION_ICONS.transcribing;
    const status = isFinal ? '✅' : '...';
    this.logger?.info(`  ${icon} "${text}" ${status}`);
  }

  /**
   * Renders the processing state.
   */
  renderProcessing(isProcessing: boolean): void {
    this.isProcessing = isProcessing;
    const icon = isProcessing ? ACTION_ICONS.processing_voice : '✅';
    const state = isProcessing ? 'Processing voice command...' : 'Ready';
    this.logger?.info(`  ${icon} ${state}`);
  }

  /**
   * Renders an error.
   */
  renderError(message: string): void {
    const visual: VisualAction = {
      type: 'error',
      label: message,
      timestamp: Date.now(),
    };
    this.actions.push(visual);
    this.logger?.info(`  ${ACTION_ICONS.error} ${message}`);
  }

  /**
   * Updates the current URL display.
   */
  updateUrl(url: string): void {
    this.currentUrl = url;
    this.logger?.info(`  ${ACTION_ICONS.navigating} ${url}`);
  }

  /**
   * Returns the current overlay state.
   */
  getOverlay(): VisualOverlay {
    return {
      actions: [...this.actions],
      isListening: this.isListening,
      isProcessing: this.isProcessing,
      currentUrl: this.currentUrl,
      transcription: this.transcription,
    };
  }

  /**
   * Clears all rendered actions.
   */
  clear(): void {
    this.actions = [];
    this.transcription = undefined;
  }
}

// ─── Event Bus Renderer ───────────────────────────────────────

/**
 * Broadcasts visual actions over the EventBus so the Workspace UI
 * can render them as a live overlay.
 */
export class EventBusActionRenderer {
  private terminal: TerminalActionRenderer;
  private eventBus: EventBus;

  constructor(eventBus: EventBus, options?: { logger?: Logger }) {
    this.eventBus = eventBus;
    this.terminal = new TerminalActionRenderer(options);
  }

  async renderAction(action: BrowserAction, result?: ActionResult): Promise<VisualAction> {
    const visual = this.terminal.renderAction(action, result);
    await this.eventBus.emit({
      type: 'voice-browser:action',
      source: 'voice-browser',
      payload: { visual, result: result ? { success: result.success, duration: result.duration } : undefined },
    });
    return visual;
  }

  async renderListening(isListening: boolean): Promise<void> {
    this.terminal.renderListening(isListening);
    await this.eventBus.emit({
      type: 'voice-browser:listening',
      source: 'voice-browser',
      payload: { isListening },
    });
  }

  async renderTranscription(text: string, isFinal: boolean): Promise<void> {
    this.terminal.renderTranscription(text, isFinal);
    await this.eventBus.emit({
      type: 'voice-browser:transcription',
      source: 'voice-browser',
      payload: { text, isFinal },
    });
  }

  async renderProcessing(isProcessing: boolean): Promise<void> {
    this.terminal.renderProcessing(isProcessing);
    await this.eventBus.emit({
      type: 'voice-browser:processing',
      source: 'voice-browser',
      payload: { isProcessing },
    });
  }

  async renderError(message: string): Promise<void> {
    this.terminal.renderError(message);
    await this.eventBus.emit({
      type: 'voice-browser:error',
      source: 'voice-browser',
      payload: { message },
    });
  }

  async updateUrl(url: string): Promise<void> {
    this.terminal.updateUrl(url);
    await this.eventBus.emit({
      type: 'voice-browser:navigated',
      source: 'voice-browser',
      payload: { url },
    });
  }

  getOverlay(): VisualOverlay {
    return this.terminal.getOverlay();
  }

  clear(): void {
    this.terminal.clear();
  }
}
