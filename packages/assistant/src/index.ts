/**
 * `@vestara/assistant` — independent assistant client package.
 *
 * Framework-free conversation transport + SSE parsing + offline fixtures,
 * shared by workspace v1, workspace-ui v2, and future non-React consumers
 * (TUI, Telegram). Presentational components stay in the apps; the React
 * turn-state binding (`react.ts`) lands in stage 2.
 */

export {
  ASSISTANT_ERROR_NOTICE,
  ASSISTANT_GREETING,
  ASSISTANT_IDENTITY,
  ASSISTANT_REPLIES,
  ASSISTANT_SUGGESTIONS,
  type AssistantFixtureMessage,
  type AssistantSuggestion,
} from './fixtures.js';
export { type AssistantTurnBinding, useAssistantTurn } from './react.js';
export {
  type AssistantStreamEvent,
  type AssistantStreamEventType,
  type AssistantStreamFrame,
  parseStreamFrames,
} from './sse.js';
export {
  AssistantTurn,
  type AssistantToolOperation,
  isAssistantExecutionDetail,
  type StructuredProjection,
  type ToolOperationState,
  type TurnTerminal,
} from './store.js';
export {
  answerQuestion,
  AssistantApiError,
  type AssistantIdentity,
  type AssistantPermissionDecision,
  type AssistantReply,
  type AssistantSession,
  type AssistantTransport,
  type ConversationMessage,
  cancelAssistantTurn,
  createAssistantConversation,
  createAssistantTransport,
  type ExecutionConfig,
  fetchAssistantIdentity,
  getConversation,
  getLatestAssistantText,
  isAssistantTurnActive,
  loginAssistant,
  loginWithPassword,
  type PasswordLoginResult,
  respondToPermission,
  type StreamEnd,
  type StreamHandlers,
  type StreamResult,
  sendAssistantMessage,
  streamAssistantMessage,
  type ToolObservation,
  validateAssistantToken,
  verifyMfaCode,
} from './transport.js';
