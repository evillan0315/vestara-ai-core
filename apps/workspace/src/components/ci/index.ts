/**
 * CI-UI-003 — Reusable CI presentation components.
 *
 * Content blocks (no card/page chrome) consumed by Settings and reusable in
 * Activity Room, Execution, and Workflow. Hosts own section chrome and
 * spacing via canonical Vestara primitives.
 */

export { CIGitHubConnection } from './CIConnectionCard.js';
export type { CIGitHubConnectionView, GitHubConnectionStatus } from './CIConnectionCard.js';
export { CICorrelationDetails } from './CICorrelationDetails.js';
export { CILifecycleStages } from './CILifecycleTrace.js';
export { CIGitHubStatus, CIStatusSeparationNote, CIVestaraVerification } from './CIStatusCards.js';
export { CIVerificationWaitList } from './CIVerificationWaitList.js';
export { CIWebhookHealth } from './CIWebhookHealth.js';
export {
  CIAuthorityNote,
  CIAvailabilityNotice,
  CIFact,
  CISubHeading,
  CIToneChip,
  toneTextClass,
} from './ci-chrome.js';
export {
  decisionActionOf,
  viewFromCIStatus,
} from './ci-read-model.js';
export type {
  CIAvailabilityDto,
  CIStatusResponse,
  CIStatusView,
  CIVerificationActionDto,
  CIWebhookStateDto,
} from './ci-read-model.js';
export type {
  CIAvailability,
  CICorrelationView,
  CIGitHubCIView,
  CILifecycleStage,
  CILifecycleStageId,
  CILifecycleStageState,
  CITone,
  CIVerdict,
  CIVerificationAction,
  CIVerificationDisposition,
  CIVestaraVerificationView,
  CIWaitProjection,
  CIWaitView,
  CIWebhookHealthView,
} from './ci-view-model.js';
export {
  buildLifecycle,
  correlationFromWait,
  dispositionFromAction,
  field,
  labelForAction,
  labelForConclusion,
  labelForDisposition,
  labelForStatus,
  labelForVerdict,
  relativeTime,
  shortSha,
  toneForConclusion,
  toneForDisposition,
  toneForStatus,
  waitToView,
} from './ci-view-model.js';
export { useCIStatus } from './use-ci-status.js';
export type { CIStatusResult } from './use-ci-status.js';
