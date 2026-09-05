/**
 * @vestara/voice-browser — Types
 *
 * Type definitions for voice-driven browser automation.
 */

// ─── Browser Actions ──────────────────────────────────────────

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'go_back'
  | 'go_forward'
  | 'reload'
  | 'select'
  | 'hover'
  | 'focus'
  | 'screenshot'
  | 'wait'
  | 'extract_text'
  | 'close_tab'
  | 'new_tab'
  | 'switch_tab';

export interface BrowserAction {
  readonly type: BrowserActionType;
  readonly target?: string;
  readonly value?: string;
  readonly selector?: string;
  readonly coordinates?: { x: number; y: number };
  readonly scrollDirection?: 'up' | 'down' | 'left' | 'right';
  readonly scrollAmount?: number;
  readonly waitMs?: number;
  readonly tabIndex?: number;
}

export interface ActionResult {
  readonly success: boolean;
  readonly action: BrowserAction;
  readonly screenshot?: string;
  readonly extractedText?: string;
  readonly error?: string;
  readonly duration: number;
}

// ─── Voice Intent ─────────────────────────────────────────────

export type VoiceIntentType =
  | 'navigate_url'
  | 'navigate_search'
  | 'click_element'
  | 'type_text'
  | 'scroll_page'
  | 'go_back'
  | 'go_forward'
  | 'reload_page'
  | 'take_screenshot'
  | 'extract_page_text'
  | 'close_tab'
  | 'new_tab'
  | 'switch_tab'
  | 'select_option'
  | 'unknown';

export interface VoiceIntent {
  readonly type: VoiceIntentType;
  readonly confidence: number;
  readonly rawText: string;
  readonly params: Record<string, string | number | boolean>;
}

// ─── Visual Feedback ──────────────────────────────────────────

export type VisualActionType =
  | 'navigating'
  | 'typing'
  | 'clicking'
  | 'scrolling'
  | 'loading'
  | 'extracting'
  | 'error'
  | 'success'
  | 'listening'
  | 'processing_voice'
  | 'transcribing';

export interface VisualAction {
  readonly type: VisualActionType;
  readonly label: string;
  readonly detail?: string;
  readonly target?: string;
  readonly timestamp: number;
  readonly duration?: number;
  readonly coordinates?: { x: number; y: number };
  readonly selector?: string;
}

export interface VisualOverlay {
  readonly actions: VisualAction[];
  readonly isListening: boolean;
  readonly isProcessing: boolean;
  readonly currentUrl?: string;
  readonly transcription?: string;
}

// ─── Pipeline State ───────────────────────────────────────────

export type PipelineState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'parsing_intent'
  | 'executing_action'
  | 'rendering_feedback'
  | 'error';

export interface PipelineConfig {
  readonly wakeWord?: string;
  readonly language?: string;
  readonly autoScroll?: boolean;
  readonly visualFeedbackEnabled?: boolean;
  readonly maxConcurrentActions?: number;
  readonly actionTimeoutMs?: number;
  readonly screenshotOnAction?: boolean;
}

export interface PipelineEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}

// ─── Browser Engine ───────────────────────────────────────────

export interface BrowserPage {
  readonly url: string;
  readonly title: string;
  readonly content?: string;
}

export interface BrowserEngine {
  readonly id: string;
  readonly name: string;

  navigate(url: string): Promise<ActionResult>;
  click(selector: string): Promise<ActionResult>;
  type(selector: string, text: string): Promise<ActionResult>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<ActionResult>;
  goBack(): Promise<ActionResult>;
  goForward(): Promise<ActionResult>;
  reload(): Promise<ActionResult>;
  screenshot(): Promise<string>;
  getText(selector?: string): Promise<string>;
  getCurrentPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}
