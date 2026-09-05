/**
 * @vestara/voice-browser — Voice-Driven Web Browser Automation
 *
 * Audio stream flow for browsing the web using voice:
 *
 *   Mic → AudioStream → VAD → STT → IntentParser
 *   → BrowserAction → BrowserEngine → VisualRenderer
 *
 * The pipeline connects @vestara/audio, @vestara/stt, and a browser
 * automation engine with visual on-screen feedback.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Voice-Driven Web Navigation
 */

// ─── Visual Renderers ─────────────────────────────────────────
export { EventBusActionRenderer, TerminalActionRenderer } from './action-renderer.js';
// ─── Browser Engines ──────────────────────────────────────────
export { PlaywrightBrowserEngine, StubBrowserEngine } from './browser-automation-engine.js';
// ─── Governed Bridge Adapter ───────────────────────────────────
export { BrowserEngineAdapter, type BrowserEngineAdapterOptions } from './browser-engine-adapter.js';
// ─── Instruction → Task Planner ───────────────────────────────
export {
  extractCredentials,
  extractTarget,
  type InstructionPlan,
  type PlanBrowserTaskOptions,
  planBrowserTask,
} from './instruction-to-task.js';
// ─── Types ────────────────────────────────────────────────────
export type {
  ActionResult,
  BrowserAction,
  BrowserActionType,
  BrowserEngine,
  BrowserPage,
  PipelineConfig,
  PipelineEvent,
  PipelineState,
  VisualAction,
  VisualActionType,
  VisualOverlay,
  VoiceIntent,
  VoiceIntentType,
} from './types.js';
export type { VoiceBrowserPipeline } from './voice-browser-pipeline.js';
// ─── Pipeline ─────────────────────────────────────────────────
export { DefaultVoiceBrowserPipeline } from './voice-browser-pipeline.js';
// ─── Voice Intent Parser ──────────────────────────────────────
export { intentToAction, parseVoiceIntent } from './voice-intent-parser.js';
