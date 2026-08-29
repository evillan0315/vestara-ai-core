// @vestara/opencode-runtime — controlled integration boundary for OpenCode.

export { OpenCodeAdapterBoundary, type RawHttpResponse } from './client/opencode-adapter-boundary';
export type { OpenCodeClient } from './client/opencode-client';
export type { OpenCodeErrorPayload, OpenCodeIntegrationErrorCode } from './client/opencode-errors';
export {
  authenticationFailedError,
  disabledError,
  invalidResponseError,
  isOpenCodeIntegrationError,
  mapUpstreamStatus,
  OpenCodeIntegrationError,
  permissionDeniedError,
  policyBlockedError,
  sessionNotFoundError,
  timeoutError,
  unavailableError,
  upstreamError,
} from './client/opencode-errors';
export { OpenCodeHttpClient } from './client/opencode-http-client';
export type {
  CreateOpenCodeSessionInput,
  InitOpenCodeSessionInput,
  OpenCodeActiveSessionInfo,
  OpenCodeEvent,
  OpenCodeFileChange,
  OpenCodeFileChangeStatus,
  OpenCodeFileContent,
  OpenCodeFileQuery,
  OpenCodeFindFileQuery,
  OpenCodeFindMatch,
  OpenCodeFindSymbolQuery,
  OpenCodeFindTextQuery,
  OpenCodeHealth,
  OpenCodeJsonSchema,
  OpenCodeMessage,
  OpenCodeMessageResult,
  OpenCodeModelRef,
  OpenCodeOutputFormat,
  OpenCodeProject,
  OpenCodePromptPart,
  OpenCodeQuestionInfo,
  OpenCodeQuestionOption,
  OpenCodeQuestionReply,
  OpenCodeQuestionRequest,
  OpenCodeRequestContext,
  OpenCodeSession,
  OpenCodeSessionBinding,
  OpenCodeSessionDurableEvent,
  OpenCodeSessionHistory,
  OpenCodeSessionStatus,
  OpenCodeShellResult,
  OpenCodeSymbol,
  RevertOpenCodeSessionInput,
  RunOpenCodeCommandInput,
  RunOpenCodeShellInput,
  SendOpenCodeMessageAsyncInput,
  SendOpenCodeMessageInput,
  SummarizeOpenCodeSessionInput,
  VestaraPermissionDecision,
} from './client/opencode-types';
export type {
  CheckCompatibilityInput,
  OpenCodeCompatibilityResult,
  OpenCodeContractChange,
  OpenCodeContractChangeKind,
  OpenCodeContractChangeSeverity,
  OpenCodeDocumentPair,
} from './compatibility/compatibility-engine';
export {
  canonicalizeOpenApi,
  checkOpenApiCompatibility,
  classifyOpenApiDiff,
  diffOpenApiDocuments,
  hashNormalizedDocument,
  knownOpenCodeEnum,
  normalizeOpenApiDocument,
} from './compatibility/compatibility-engine';
export type { OpenCodeCompatibilityEvidence } from './compatibility/compatibility-evidence';
export {
  contractEventType,
  renderCompatibilityEvidence,
  toCompatibilityEvidence,
} from './compatibility/compatibility-evidence';
export type { OpenCodePinnedSchema } from './compatibility/pinned-schema';
export { hasPinnedSchema, loadPinnedSchema } from './compatibility/pinned-schema';
export type { OpenCodePolicies, OpenCodeRuntimeConfig, OpenCodeRuntimeConfigInput } from './config';
export {
  OPENCODE_DEFAULTS,
  OpenCodeConfigError,
  openCodeConfigFromEnv,
  resolveOpenCodeConfig,
} from './config';
export { normalizeAgents, normalizeCommands, normalizeProviders } from './discovery-normalizers';
export {
  OpenCodeEventBridge,
  type OpenCodeEventBridgeMetrics,
  type OpenCodeEventBridgeOptions,
} from './events/event-bridge';
export type {
  OpenCodeBridgeConnectionState,
  OpenCodeBridgeEvent,
  OpenCodeBridgeEventCategory,
} from './events/event-types';
export { normalizeOpenCodeEvent } from './events/event-types';
export type {
  OpenCodeEvidenceDiffSummary,
  OpenCodeEvidenceMessageSummary,
  OpenCodeEvidenceTodoSummary,
  OpenCodeExecutionEvidence,
  SummarizeOpenCodeExecutionInput,
} from './evidence/execution-evidence';
export { renderOpenCodeExecutionEvidence, summarizeOpenCodeExecution } from './evidence/execution-evidence';
export type {
  OpenCodeExecutionEventLike,
  VestaraExecutionEvent,
  VestaraExecutionEventType,
  VestaraExecutionState,
} from './execution-normalizer';
export { classifyOpenCodeExecutionEvent } from './execution-normalizer';
export { normalizeFileStatus, normalizeFindMatches, normalizeSymbols } from './file-normalizers';
export type {
  OpenCodePermissionDecisionInput,
  OpenCodePermissionRecord,
  PermissionRegistry,
} from './permissions/permission-registry';
export { InMemoryPermissionRegistry, requirePendingPermission } from './permissions/permission-registry';
export type {
  OpenCodePermissionAction,
  OpenCodePermissionRequest,
  OpenCodePermissionRisk,
  OpenCodePermissionStatus,
} from './permissions/permission-types';
export {
  classifyPermissionRisk,
  normalizePermissionAction,
  normalizePermissionRequest,
} from './permissions/permission-types';
export type { OpenCodeConnectionState, OpenCodeRuntimeHealth, OpenCodeRuntimeHooks } from './runtime/opencode-runtime';
export { OpenCodeRuntime } from './runtime/opencode-runtime';
export { normalizeDiff, normalizeMessages, normalizeTodos } from './session-normalizers';
export type { RuntimeSessionRegistry } from './sessions/runtime-session-registry';
export {
  DEFAULT_CONTINUITY_POLICY,
  DEFAULT_MAX_PHYSICAL_SESSIONS,
  InMemoryRuntimeSessionRegistry,
} from './sessions/runtime-session-registry';
export type { OwnershipContext, OwnershipResult, SessionRegistry } from './sessions/session-registry';
export { InMemorySessionRegistry, requireSessionOwnership } from './sessions/session-registry';
