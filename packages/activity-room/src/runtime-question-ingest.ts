/**
 * AR-TOOL-ASK-003A — `question.asked` ingestion into the durable interaction.
 *
 * This module is the ONLY new-authority ingestion point for runtime
 * questions: it ensures the durable interaction EXISTS (pending) before the
 * Activity Room can authoritatively answer it. The browser may continue to
 * receive SSE as a presentation hint, but SSE never becomes answer
 * authority — authoritative answering resolves the durable interaction via
 * {@link answerRuntimeQuestion} (presented → claimed CAS).
 *
 * 003A boundary: nothing here delivers to OpenCode. No question reply
 * call, no question reject call, no leases, no retries, no reconciliation.
 * Delivery is AR-TOOL-ASK-003B.
 */

import type {
  ClaimRuntimeQuestionInput,
  IngestRuntimeQuestionInput,
  RuntimeQuestionInteraction,
} from './runtime-interaction-contract';
import type { RuntimeQuestionInteractionStore } from './runtime-interaction-store';

/**
 * Ingest a runtime `question.asked` event. Idempotent: the same exact
 * (sessionID, requestId) pair always resolves to the same durable
 * interaction and never creates a second row. Never throws for store
 * contention — throws only for missing identities (fail closed, never
 * inferred) or unusable question payloads.
 */
export function ingestRuntimeQuestionAsked(
  store: RuntimeQuestionInteractionStore,
  input: IngestRuntimeQuestionInput,
): RuntimeQuestionInteraction {
  return store.ingestAsked(input);
}

/**
 * Authoritative Activity Room answer: resolve the DURABLE interaction via
 * the single-use claim CAS (exact id + claim token + expected version).
 * The caller obtained the token/version from an authoritative presentation,
 * never from SSE prose. Exactly one claim wins; all others fail closed.
 */
export function answerRuntimeQuestion(
  store: RuntimeQuestionInteractionStore,
  input: ClaimRuntimeQuestionInput,
): RuntimeQuestionInteraction {
  return store.claim(input);
}
