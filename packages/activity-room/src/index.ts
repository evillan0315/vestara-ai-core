export { type TriggerAssistantTurnOptions, triggerAssistantTurn } from './assistant-turn';
export type { AssistantTurnResult, AssistantTurnStatus } from './assistant-types';
export { type ActivityBatch, toActivityBatch } from './batch';
export type {
  ActivityActor,
  ActivityActorType,
  ActivityBase,
  ActivityKind,
  ActivityOrganizationalEffect,
  ActivityRecord,
  AgentMessageActivity,
  AgentMessageKind,
  MessageTarget,
  TaskActivity,
  TaskActivityStatus,
  TestActivity,
  VerificationActivity,
  VerificationCheck,
  VerificationOutcome,
  WorkflowActivity,
} from './contracts';
export { ACTIVITY_KINDS } from './contracts';
export type { EffectiveCorrection, EffectiveOpenItem, EffectiveState, EffectiveUnitState } from './effective-state';
export { projectEffectiveState } from './effective-state';
export {
  fromAgentLifecycle,
  fromHumanMessage,
  fromInteractionPresented,
  fromInteractionResponded,
  fromToolEvent,
  fromWorkflowEvent,
} from './m9-adapter';
export { M9DeliveryVerifier } from './m9-delivery-verifier';
export { M9IngestionBridge, type M9IngestionBridgeOptions } from './m9-ingestion-bridge';
export { SqliteActivityStore as DurableActivityStore } from './m9-sqlite-store';
export { IdempotentActivityStore } from './m9-store';
export { toProjectionRecord } from './m9-to-projection';
export type {
  ActivityCursor,
  ActivityEvent,
  ActivityPayload,
  ActivityRecord as M9ActivityRecord,
  ActivityRecordId,
  ActivitySource,
  ActivityType,
  ActivityVisibility,
  M9ActivityQuery,
  M9ActivityStore,
} from './m9-types';
export { ProjectionRuntime } from './m10-projection-runtime';
export { ACTIVITY_MANIFEST, ACTIVITY_MIGRATIONS } from './migrations';
export type {
  ActivityRoomProjection,
  AttentionEntry,
  AttentionReason,
  AttentionSeverity,
  ContextualCapabilities,
  ParticipantProjection,
  StreamImportance,
  StreamItem,
  StreamItemKind,
  WorkflowSummary,
} from './projection-types';
export { type ActivityProjector, ActivityProjectorRegistry } from './projector';
export { AgentMessageProjector } from './projectors/agent-message-projector';
export { TaskProjector } from './projectors/task-projector';
export { TestProjector } from './projectors/test-projector';
export { VerificationProjector } from './projectors/verification-projector';
export { WorkflowProjector } from './projectors/workflow-projector';
export { ActivityRedactor, DEFAULT_REDACTION_POLICY, type RedactionPolicy } from './redactor';
export { MonotonicSequence } from './sequence';
export { ActivityProjectionService, type ActivityProjectionServiceOptions, DEFAULT_PROJECTORS } from './service';
export { type ActivitySeverity, severityOf } from './severity';
export {
  type ActivitySourceAuthority,
  type ActivitySourceEvent,
  type EngineeringTruthEventLike,
  extractEvidenceRefs,
  fromEngineeringTruthEvent,
  fromOrchestrationEvent,
  numberField,
  type OrchestrationEventLike,
  resolveActivityActor,
  stringField,
  stringFieldOr,
} from './source-event';
export {
  type ActivityPage,
  type ActivityQuery,
  type ActivityStore,
  DuplicateActivityError,
  InMemoryActivityStore,
} from './store';
export { SqliteActivityStore } from './store-sqlite';
export {
  type ActivityDeliveryResult,
  ActivityStreamConnection,
  type ActivityStreamConnectionOptions,
  ActivityStreamHub,
  type ActivityStreamHubOptions,
  type ActivityStreamMessage,
  type ActivityStreamSink,
} from './stream';

// ─── OVR-005: Activity Media Binding ──────────────────────────

export type { ActivityMediaBindingServiceOptions } from './media-binding-service';
export {
  ActivityMediaBindingService,
  BindingClosureFailedError,
  BindingCreationFailedError,
  BindingError,
  BindingNotFoundError,
  ParticipantUnauthorizedError,
  ReplacementBlockedError,
} from './media-binding-service';

export type { ActivityMediaBindingStore } from './media-binding-store';
export { InMemoryActivityMediaBindingStore } from './media-binding-store';
export type {
  ActivityMediaBinding,
  ActivityMediaBindingId,
  ActivityMediaBindingStatus,
  CreateBindingOptions,
  MediaParticipantJoinResult,
  MediaParticipantType,
  ParticipantResolver,
  ResolvedParticipant,
} from './media-binding-types';
export {
  generateBindingId,
  PARTICIPANT_CAPABILITY_MAP,
} from './media-binding-types';
