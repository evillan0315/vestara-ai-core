/**
 * @vestara/screen-capture — Provider-Neutral Screen Capture Contracts (CAPTURE-001-M1).
 *
 * Foundation only: types, lifecycle validation, permission defaults, scope
 * validation, and a truthful capability probe. M1 performs NO capture, starts
 * NO recordings, ingests NO evidence, and ships NO adapters.
 *
 * M3 adds the X11 display adapter (screenshot + display only) alongside the
 * contracts. The adapter executes only already-authorized requests.
 *
 * Preserved invariants:
 *   - Capture capability != capture authority (a Port existing grants nothing).
 *   - Conversation authority != screen authority (every request needs a grant).
 *   - Agent request != human authorization (agent recording defaults to deny).
 *   - Screen capture != audio capture (no audio field, no audio capability).
 *   - FFmpeg != ScreenCapturePort (encoders are future adapter details).
 *
 * Architecture Traceability:
 *   CAPTURE-001 → governed screen-capture platform, milestones M1/M3.
 */

export * from './x11-display-adapter.js';

export type ActorType = 'human' | 'agent' | 'system';

export interface ActorRef {
  readonly actorType: ActorType;
  readonly actorId: string;
}

// ─── Capture lifecycle ──────────────────────────────────────────

export type CaptureState =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'SELECTING'
  | 'CAPTURING'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'DENIED'
  | 'CANCELLED'
  | 'FAILED';

export const TERMINAL_STATES: readonly CaptureState[] = ['COMPLETED', 'DENIED', 'CANCELLED', 'FAILED'];

export function isTerminalState(state: CaptureState): boolean {
  return TERMINAL_STATES.includes(state);
}

const ALLOWED_TRANSITIONS: Record<CaptureState, readonly CaptureState[]> = {
  REQUESTED: ['AUTHORIZED', 'DENIED', 'CANCELLED', 'FAILED'],
  AUTHORIZED: ['SELECTING', 'CANCELLED', 'FAILED'],
  SELECTING: ['CAPTURING', 'DENIED', 'CANCELLED', 'FAILED'],
  CAPTURING: ['FINALIZING', 'CANCELLED', 'FAILED'],
  FINALIZING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  DENIED: [],
  CANCELLED: [],
  FAILED: [],
};

export function canTransition(from: CaptureState, to: CaptureState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CaptureState, to: CaptureState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid capture transition: ${from} -> ${to}`);
  }
}

// ─── Capture sources & targets ──────────────────────────────────
//
// Tokens are opaque OS/portal selections. Agents MUST NOT gain window
// enumeration or arbitrary screen-inspection authority from this contract:
// there is no list-displays/list-windows operation, and geometry is only
// valid when it arrives as an explicit user/OS selection.

export interface DisplaySource {
  readonly kind: 'display';
  /** Opaque display token (never a raw framebuffer handle). */
  readonly displayId: string;
}

export interface WindowSource {
  readonly kind: 'window';
  /** Opaque OS/portal window token (never a pid, title scrape, or handle). */
  readonly windowToken: string;
}

/** Region geometry as an explicit user/OS selection (never agent-invented coordinates). */
export interface RegionGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RegionSource {
  readonly kind: 'region';
  /** Opaque OS/portal region token. */
  readonly regionToken: string;
  /** Present only when the OS/portal selection carries explicit geometry. */
  readonly geometry?: RegionGeometry;
}

export type CaptureSource = DisplaySource | WindowSource | RegionSource;

/**
 * A portal-mediated selection whose concrete scope is resolved by the OS
 * picker (native selection UX), not by the requesting agent.
 */
export interface PortalSelectionTarget {
  readonly kind: 'portal-selection';
  /** Opaque portal selection token. */
  readonly portalToken: string;
  /** Scope the OS picker resolved this selection to. */
  readonly resolvedKind: 'display' | 'window' | 'region';
}

export type CaptureTarget = CaptureSource | PortalSelectionTarget;

export type TargetScope = 'display' | 'window' | 'region';

export function scopeOfTarget(target: CaptureTarget): TargetScope {
  return target.kind === 'portal-selection' ? target.resolvedKind : target.kind;
}

// ─── Requests / handle / artifact ───────────────────────────────
//
// Deliberately audio-free: there is no includeAudio flag, no audio track,
// no audio capability. Audio capture lives in @vestara/audio under its own
// authorization family.

export interface ScreenshotRequest {
  readonly target: CaptureTarget;
  readonly requestedBy: ActorRef;
  /** Human-readable purpose bound to the authorization grant. */
  readonly purpose: string;
}

export interface RecordingRequest {
  readonly target: CaptureTarget;
  readonly requestedBy: ActorRef;
  /** Human-readable purpose bound to the authorization grant. */
  readonly purpose: string;
}

export interface RecordingHandle {
  readonly id: string;
  readonly state: CaptureState;
  readonly target: CaptureTarget;
  readonly requestedBy: ActorRef;
  readonly startedAt: string;
}

export type CaptureArtifactKind = 'screenshot' | 'screen-recording';

export interface CaptureArtifactProvenance {
  /** Adapter that produced the bytes (M1: never populated — no adapters exist). */
  readonly producer: string;
  readonly createdAt: string;
}

export interface CaptureArtifact {
  /** Content-addressed digest — the ONLY handle attachable to messages/tasks/evidence. */
  readonly ref: string;
  readonly kind: CaptureArtifactKind;
  readonly mediaType: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  /** Codec only when confidently known (never guessed). */
  readonly codec?: string;
  /** Descriptive scope label; provenance authority stays with Evidence. */
  readonly captureTarget?: TargetScope;
  readonly capturedAt?: string;
  readonly provenance: CaptureArtifactProvenance;
}

// ─── Capabilities & permission defaults ─────────────────────────
// Follows the browser-runtime precedent (allow/ask/deny) where compatible:
// unknown actions default to ask; recording is deny-by-default for agents.

export const SCREEN_CAPTURE_CAPABILITIES = [
  'screen.capture.screenshot',
  'screen.capture.record',
  'screen.capture.display',
  'screen.capture.window',
  'screen.capture.region',
] as const;

export type ScreenCaptureCapability = (typeof SCREEN_CAPTURE_CAPABILITIES)[number];

export type ScreenCaptureAction = 'screen.capture.screenshot' | 'screen.capture.record';

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export interface ScreenCapturePermissionRule {
  readonly action: ScreenCaptureAction;
  readonly actorType: ActorType;
  readonly level: PermissionLevel;
  readonly reason: string;
}

export const DEFAULT_SCREEN_CAPTURE_PERMISSIONS: readonly ScreenCapturePermissionRule[] = [
  {
    action: 'screen.capture.screenshot',
    actorType: 'human',
    level: 'ask',
    reason: 'Screenshot observes screen contents — requires explicit grant',
  },
  {
    action: 'screen.capture.screenshot',
    actorType: 'agent',
    level: 'ask',
    reason: 'Agent screenshot observes screen contents — requires human authorization',
  },
  {
    action: 'screen.capture.record',
    actorType: 'human',
    level: 'ask',
    reason: 'Recording observes screen contents over time — requires explicit grant',
  },
  {
    action: 'screen.capture.record',
    actorType: 'agent',
    level: 'deny',
    reason: 'Agent recording denied unless explicitly governed otherwise',
  },
];

export function evaluateCapturePermission(
  action: ScreenCaptureAction,
  actorType: ActorType,
  rules: readonly ScreenCapturePermissionRule[] = DEFAULT_SCREEN_CAPTURE_PERMISSIONS,
): PermissionLevel {
  const matched = rules.find((rule) => rule.action === action && rule.actorType === actorType);
  return matched?.level ?? 'ask';
}

/** Scope capability required to capture a given target scope. */
export function scopeCapabilityFor(scope: TargetScope): ScreenCaptureCapability {
  return `screen.capture.${scope}`;
}

/** Scope capability required for a concrete target. */
export function requiredScopeCapability(target: CaptureTarget): ScreenCaptureCapability {
  return scopeCapabilityFor(scopeOfTarget(target));
}

// ─── Request validation ─────────────────────────────────────────

export function validateTarget(target: CaptureTarget): string[] {
  const errors: string[] = [];
  if (target.kind === 'display' && target.displayId.trim().length === 0) {
    errors.push('display target requires a non-empty displayId');
  }
  if (target.kind === 'window' && target.windowToken.trim().length === 0) {
    errors.push('window target requires a non-empty windowToken');
  }
  if (target.kind === 'region') {
    if (target.regionToken.trim().length === 0) {
      errors.push('region target requires a non-empty regionToken');
    }
    if (target.geometry !== undefined) {
      const { x, y, width, height } = target.geometry;
      for (const [name, value] of [
        ['x', x],
        ['y', y],
        ['width', width],
        ['height', height],
      ] as const) {
        if (!Number.isFinite(value)) {
          errors.push(`region geometry.${name} must be finite`);
        }
      }
      if (Number.isFinite(width) && width <= 0) {
        errors.push('region geometry.width must be positive');
      }
      if (Number.isFinite(height) && height <= 0) {
        errors.push('region geometry.height must be positive');
      }
    }
  }
  if (target.kind === 'portal-selection' && target.portalToken.trim().length === 0) {
    errors.push('portal-selection target requires a non-empty portalToken');
  }
  return errors;
}

function validateActorAndPurpose(requestedBy: ActorRef, purpose: string): string[] {
  const errors: string[] = [];
  if (requestedBy.actorId.trim().length === 0) {
    errors.push('requestedBy.actorId must be non-empty');
  }
  if (purpose.trim().length === 0) {
    errors.push('purpose must be non-empty');
  }
  return errors;
}

export function validateScreenshotRequest(request: ScreenshotRequest): string[] {
  return [...validateTarget(request.target), ...validateActorAndPurpose(request.requestedBy, request.purpose)];
}

export function validateRecordingRequest(request: RecordingRequest): string[] {
  return [...validateTarget(request.target), ...validateActorAndPurpose(request.requestedBy, request.purpose)];
}

// ─── Capability probe ───────────────────────────────────────────
//
// Truthful environment reporting. M1 ships no adapters, so every
// operation×scope capability reports unavailable. The probe distinguishes
// all six combos individually and never fakes success.

export type CaptureOperation = 'screenshot' | 'recording';

export interface CaptureCapabilityStatus {
  readonly operation: CaptureOperation;
  readonly scope: TargetScope;
  readonly supported: boolean;
  /** Why unsupported (M1: no adapter registered) or which mechanism would serve it. */
  readonly reason: string;
}

export type SessionKind = 'x11' | 'wayland' | 'unknown';

export interface ScreenCaptureProbeResult {
  readonly available: boolean;
  readonly sessionKind: SessionKind;
  /** Active display identifier when detectable (e.g. DISPLAY), else null. */
  readonly display: string | null;
  readonly capabilities: readonly CaptureCapabilityStatus[];
  readonly checkedAt: string;
}

export interface ProbeEnvironment {
  readonly DISPLAY?: string;
  readonly WAYLAND_DISPLAY?: string;
  readonly XDG_SESSION_TYPE?: string;
}

function detectSessionKind(env: ProbeEnvironment): SessionKind {
  const sessionType = env.XDG_SESSION_TYPE?.trim().toLowerCase();
  if (sessionType === 'wayland' || (env.WAYLAND_DISPLAY?.trim() ?? '') !== '') {
    return 'wayland';
  }
  if (sessionType === 'x11' || (env.DISPLAY?.trim() ?? '') !== '') {
    return 'x11';
  }
  return 'unknown';
}

const PROBE_OPERATIONS: readonly CaptureOperation[] = ['screenshot', 'recording'];
const PROBE_SCOPES: readonly TargetScope[] = ['display', 'window', 'region'];

/**
 * Report detected session truth + per-capability availability.
 * Without backend input every capability is unavailable (M1: no adapters).
 * Adapters (M3+) pass verified backend statuses which override the matching
 * operation×scope entries — the ONLY path to `supported: true`.
 */
export async function probeScreenCaptureCapabilities(
  env: ProbeEnvironment = process.env as ProbeEnvironment,
  backendCapabilities?: readonly CaptureCapabilityStatus[],
): Promise<ScreenCaptureProbeResult> {
  const sessionKind = detectSessionKind(env);
  const display = env.DISPLAY?.trim() ? env.DISPLAY.trim() : null;
  const reason =
    sessionKind === 'unknown'
      ? 'M1: no capture adapter registered and no display session detected'
      : `M1: no capture adapter registered for ${sessionKind} session`;
  const capabilities: CaptureCapabilityStatus[] = PROBE_OPERATIONS.flatMap((operation) =>
    PROBE_SCOPES.map((scope) => {
      const backend = backendCapabilities?.find((entry) => entry.operation === operation && entry.scope === scope);
      if (backend) return { ...backend };
      return { operation, scope, supported: false, reason };
    }),
  );
  return {
    available: false,
    sessionKind,
    display,
    capabilities,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Port (domain contract — adapters implement in later milestones) ───

export type CaptureStateListener = (id: string, state: CaptureState) => void;

export interface ScreenCapturePort {
  probe(): Promise<ScreenCaptureProbeResult>;
  requestScreenshot(request: ScreenshotRequest): Promise<CaptureArtifact>;
  startRecording(request: RecordingRequest): Promise<RecordingHandle>;
  stopRecording(handleId: string): Promise<CaptureArtifact>;
  cancel(id: string): Promise<void>;
  onStateChanged(listener: CaptureStateListener): () => void;
}

// ─── Evidence alignment (CAPTURE-001-M2) ────────────────────────
//
// The durable attachment identity is ALWAYS the content-addressed evidence
// digest. DurableCaptureRef is branded so a temp pathname can never
// typecheck where a digest is required: the ONLY constructors are
// fromEvidenceReference (digest in) and finalizeTempCapture (ingest out).

/** Branded evidence digest. Construct only via fromEvidenceReference/finalizeTempCapture. */
export type DurableCaptureRef = string & { readonly __brand: 'DurableCaptureRef' };

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function isDurableCaptureRef(value: unknown): value is DurableCaptureRef {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

/** Structural shape of a canonical EvidenceReference (no package coupling). */
export interface EvidenceBackedReference {
  readonly ref: string;
  readonly kind: CaptureArtifactKind;
  readonly mediaType: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly codec?: string;
  readonly producer: string;
  readonly capturedAt: string;
}

/**
 * Adopt a canonical evidence reference as a CaptureArtifact. The digest
 * becomes the artifact identity; capture metadata rides descriptively.
 * Rejects non-capture kinds and non-digest refs (paths fail closed).
 */
export function fromEvidenceReference(
  reference: EvidenceBackedReference,
  options?: { captureTarget?: TargetScope },
): { artifact: CaptureArtifact; durableRef: DurableCaptureRef } {
  if (reference.kind !== 'screenshot' && reference.kind !== 'screen-recording') {
    throw new Error(`fromEvidenceReference: kind '${reference.kind}' is not a capture artifact`);
  }
  if (!isDurableCaptureRef(reference.ref)) {
    throw new Error('fromEvidenceReference: ref is not a content-addressed digest');
  }
  const durableRef = reference.ref as DurableCaptureRef;
  const artifact: CaptureArtifact = {
    ref: durableRef,
    kind: reference.kind,
    mediaType: reference.mediaType,
    size: reference.size,
    width: reference.width,
    height: reference.height,
    durationMs: reference.durationMs,
    codec: reference.codec,
    captureTarget: options?.captureTarget,
    capturedAt: reference.capturedAt,
    provenance: { producer: reference.producer, createdAt: reference.capturedAt },
  };
  return { artifact, durableRef };
}

// ─── Temporary-artifact lifecycle (M2 contract) ─────────────────
//
// CAPTURING → temp exists (caller-owned) → FINALIZING → validate + hash +
// ingest → COMPLETED holds the DurableCaptureRef. FAILED/CANCELLED MUST
// dispose the temp via TempArtifactDisposal. Adapters implement disposal;
// the type system prevents confusing temp identity with durable identity.

export interface TempCaptureArtifact {
  readonly tempId: string;
  readonly kind: CaptureArtifactKind;
  readonly state: 'CAPTURING' | 'FINALIZING';
  readonly createdAt: string;
}

export interface TempArtifactDisposal {
  dispose(reason: 'completed' | 'failed' | 'cancelled'): Promise<void>;
}

/**
 * Accept an ingested digest for a FINALIZING temp and mint the durable ref.
 * Temps in any other state, or raw pathnames, fail closed.
 */
export function finalizeTempCapture(temp: TempCaptureArtifact, digest: string): DurableCaptureRef {
  if (temp.state !== 'FINALIZING') {
    throw new Error(`finalizeTempCapture: temp '${temp.tempId}' is not FINALIZING`);
  }
  if (!isDurableCaptureRef(digest)) {
    throw new Error('finalizeTempCapture: digest is not a content-addressed digest');
  }
  return digest as DurableCaptureRef;
}

/**
 * Append a durable ref to an evidenceRefs carrier (Activity Room
 * attachment). Returns a new array — no bytes, no mutation, no ownership
 * transfer. The digest remains owned by the evidence store.
 */
export function attachEvidenceRefs(existing: readonly string[], durableRef: DurableCaptureRef): readonly string[] {
  return [...existing, durableRef];
}
