---
title: OpenCode Server Integration Plan
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-05
next-review: 2026-09-05
---

# OpenCode Server Integration Plan

## Purpose

Define the controlled integration boundary between Vestara and the OpenCode
headless HTTP server. Vestara exposes OpenCode **capabilities**, not the
OpenCode port: the Vestara API becomes the authority for identity, policy,
observability, evidence, and agent governance while OpenCode serves as a
replaceable execution backend.

## Architecture

```text
Vestara Workspace / CLI / Agents
               │
               ▼
http://127.0.0.1:3001/api/opencode/*
               │
        Vestara API Gateway
   auth · policy · telemetry · audit
               │
               ▼
http://127.0.0.1:4096/*
        OpenCode HTTP Server
```

OpenCode runs a headless HTTP server on `127.0.0.1:4096`, publishes an OpenAPI
3.1 document at `/doc`, supports HTTP Basic authentication, and exposes REST
endpoints plus Server-Sent Events through `/event` and `/global/event`.

## Integration objective

Vestara does **not** expose OpenCode as an unrestricted transparent proxy. The
Vestara API provides:

- a stable Vestara-owned API namespace (`/api/opencode/*`);
- authentication and workspace authorization;
- request validation;
- OpenCode lifecycle and health monitoring;
- telemetry and engineering-event publication;
- session ownership mapping;
- permission interception;
- streaming event forwarding;
- endpoint allowlisting;
- audit logging;
- future compatibility if the OpenCode API changes.

A general-purpose `/api/opencode/proxy/*` is not exposed initially.

## Package structure

```text
packages/
└── opencode-runtime/
    ├── src/
    │   ├── index.ts
    │   ├── contracts.ts
    │   ├── config.ts
    │   ├── client/
    │   │   ├── opencode-client.ts
    │   │   ├── opencode-http-client.ts
    │   │   ├── opencode-errors.ts
    │   │   └── opencode-types.ts
    │   ├── runtime/
    │   │   ├── opencode-runtime.ts
    │   │   ├── health-monitor.ts
    │   │   └── connection-state.ts
    │   ├── sessions/
    │   │   ├── session-service.ts
    │   │   ├── session-registry.ts
    │   │   └── session-ownership.ts
    │   ├── events/
    │   │   ├── event-stream-client.ts
    │   │   ├── event-normalizer.ts
    │   │   └── event-translator.ts
    │   ├── permissions/
    │   │   ├── permission-service.ts
    │   │   └── permission-policy.ts
    │   └── validation/
    │       ├── request-schemas.ts
    │       └── response-schemas.ts
    ├── tests/
    └── package.json

apps/api/src/
├── routes/
│   └── opencode/
│       ├── index.ts
│       ├── health.routes.ts
│       ├── project.routes.ts
│       ├── session.routes.ts
│       ├── message.routes.ts
│       ├── event.routes.ts
│       ├── permission.routes.ts
│       └── admin.routes.ts
└── services/
    └── opencode-api-adapter.ts
```

The package depends only on shared Vestara contracts:
`@vestara/runtime`, `@vestara/events`, `@vestara/event-bus`,
`@vestara/telemetry`, `@vestara/activity-log`, `@vestara/capabilities`.

The API app depends on `@vestara/opencode-runtime`, not on OpenCode-specific
HTTP implementation details.

## Configuration

```env
OPENCODE_SERVER_URL=http://127.0.0.1:4096
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=<local-secret>
OPENCODE_REQUEST_TIMEOUT_MS=30000
OPENCODE_HEALTH_TIMEOUT_MS=3000
OPENCODE_EVENT_RECONNECT_MS=2000
OPENCODE_MAX_EVENT_RECONNECT_MS=30000
OPENCODE_PROXY_ENABLED=true
OPENCODE_ALLOW_SHELL=false
OPENCODE_ALLOW_CONFIG_WRITE=false
OPENCODE_ALLOW_PROVIDER_AUTH=false
OPENCODE_ALLOW_INSTANCE_DISPOSE=false
```

Credentials stay server-side and are never returned to the browser or
workspace client. Configuration is validated at startup; the API fails clearly
when integration is enabled but credentials or the server URL are missing.

## Client boundary

`OpenCodeClient` exposes typed methods: health, projects, sessions (list,
create, get, delete), messages (send, async), abort, permission response, and
an SSE event stream. No native `Response` objects cross the package boundary;
all upstream responses are normalized into typed Vestara-domain DTOs.

## API surface

- **Phase 1 — Health and discovery**: `/health`, `/project`, `/path`, `/vcs`,
  `/providers`, `/agents`, `/commands`.
- **Phase 2 — Session management**: session CRUD, status, children, todos,
  diff, fork, summarize, abort, revert, unrevert.
- **Phase 3 — Messages and execution**: message history, send, async prompt,
  slash commands. Direct shell execution is not exposed initially.

## Session ownership

Every session is bound to a Vestara workspace and owner:

```ts
interface OpenCodeSessionBinding {
  readonly openCodeSessionId: string;
  readonly vestaraSessionId: string;
  readonly workspaceId: string;
  readonly executionId?: string;
  readonly agentId?: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly status: "active" | "completed" | "aborted" | "deleted";
}
```

Every request performs: authenticate → workspace membership → session binding →
ownership check → policy evaluation → OpenCode request. Client-provided
filesystem roots are validated against the active Vestara workspace.

## Event streaming

The production design consumes one upstream SSE connection (`/event`) and
redistributes normalized events through Vestara's EventBus. Events are
validated, normalized, attached with workspace/session identity, deduplicated,
and translated into Vestara domain events. Unknown event types are retained as
`integration.opencode.event` with sanitized payloads.

## Permission integration

OpenCode permission requests map into Vestara's approval system. The client
never sends arbitrary OpenCode permission response strings; a Vestara
discriminated union (`approve` with scope, or `reject` with reason) is
translated into the exact upstream format. All decisions emit immutable audit
and engineering evidence events.

## Endpoint policy

- **Safe initial exposure**: health, project, path, vcs, providers, agents,
  commands, sessions (read), messages (read), todos, diff, event.
- **Controlled write**: session create/update/delete, message send, async
  prompt, command, abort, permissions, fork, revert, unrevert.
- **Capability-gated**: shell, config, mcp, provider auth.
- **Disabled by default**: instance dispose, session share, provider OAuth,
  TUI control.

## Request/response handling

Every upstream call carries request ID, correlation ID, workspace ID,
execution ID, agent ID, session ID, timeout, and abort signal. Sensitive
headers (authorization, cookie, host, connection, x-forwarded-*) are never
forwarded; Basic authentication is constructed server-side.

## Error normalization

Stable error model with codes such as `OPENCODE_DISABLED`,
`OPENCODE_UNAVAILABLE`, `OPENCODE_TIMEOUT`, `OPENCODE_AUTHENTICATION_FAILED`,
`OPENCODE_SESSION_NOT_FOUND`, `OPENCODE_PERMISSION_DENIED`,
`OPENCODE_INVALID_RESPONSE`, `OPENCODE_POLICY_BLOCKED`, `OPENCODE_UPSTREAM_ERROR`.
Upstream network failure → 503; timeout → 504; invalid input → 400;
unauthenticated → 401; forbidden → 403; missing session → 404; conflict → 409;
unexpected upstream → 502. No upstream stack traces, raw HTML, secrets, or
internal paths are returned.

## Runtime lifecycle

`OpenCodeRuntime` is a managed Vestara runtime:

```text
created → initializing → checking-upstream → connecting-events → running
  → degraded/reconnecting → stopping → stopped
```

Responsibilities: validate config, check `/global/health`, establish the SSE
subscription, report health through `HealthAggregator`, reconnect with bounded
exponential backoff, stop cleanly, abort outstanding requests on shutdown, and
emit lifecycle telemetry.

## OpenAPI compatibility

The pinned OpenCode OpenAPI schema is captured and generated into
`packages/opencode-runtime/src/generated`. A `pnpm opencode:spec:check` command
fetches the current document, compares its checksum with the pinned schema, and
reports breaking endpoint or type changes.

## Security controls

OpenCode stays bound to `127.0.0.1`; Basic authentication is enabled;
credentials remain in the Vestara API process; `/api/opencode/*` requires
Vestara authentication; workspace/session ownership is enforced; an endpoint
allowlist is used; bodies and parameters are validated; provider tokens and
file content are redacted from logs; message/command/permission endpoints are
rate-limited; body-size limits apply; path traversal and unapproved workspace
directories are rejected; shell, config mutation, auth mutation, and instance
disposal are disabled by default; all mutating operations emit audit records.

## Telemetry and evidence

For every request: `opencode.request.started/completed/failed/timeout`. For the
connection: `opencode.runtime.connected/disconnected/reconnecting/unhealthy`.
For sessions/execution: `opencode.session.*`, `opencode.message.*`,
`opencode.permission.*`. Prompt contents, source code, credentials, and full
responses are not placed in general telemetry.

## Testing

Unit tests for config validation, Basic auth construction, URL serialization,
timeout/abort, error normalization, session ownership, endpoint policy, event
parsing, secret redaction, reconnect backoff, and unknown-event handling.
Contract tests run against a real local OpenCode server. API integration,
failure, and security tests verify auth requirements, credential redaction,
ownership 403s, policy-blocked 403s, downtime 503s, timeout 504s, normalized
SSE delivery, and disabled dangerous endpoints.

## Milestones

- **OCV-001** — OpenCode Runtime Foundation: package, config, HTTP client,
  Basic auth, health check, runtime lifecycle, normalized errors.
- **OCV-002** — Discovery API: project, path, vcs, providers, agents, commands.
- **OCV-003** — Session Gateway: session CRUD, binding registry, ownership
  enforcement, status, todos, children, diff, abort.
- **OCV-004** — Message Execution: sync/async messages, history, slash
  commands, execution correlation, cancellation.
- **OCV-005** — Event Bridge: single SSE connection, normalize, EventBus
  publication, WebSocket/SSE delivery.
- **OCV-006** — Permission Governance: detection, classification, approval
  records, approve/reject API, forwarding, audit.
- **OCV-007** — Engineering Evidence: session-to-execution correlation,
  evidence capture, verifier-readable completion evidence.
- **OCV-008** — Contract and Compatibility Guard: pinned schema, generated
  types, checksum, compatibility check, CI validation.

## First-release endpoint set

```text
GET  /api/opencode/health
GET  /api/opencode/project
GET  /api/opencode/agents
GET  /api/opencode/providers
GET  /api/opencode/sessions
POST /api/opencode/sessions
GET  /api/opencode/sessions/:sessionId
DELETE /api/opencode/sessions/:sessionId
GET  /api/opencode/sessions/:sessionId/messages
POST /api/opencode/sessions/:sessionId/messages
POST /api/opencode/sessions/:sessionId/messages/async
POST /api/opencode/sessions/:sessionId/abort
GET  /api/opencode/sessions/:sessionId/diff
POST /api/opencode/sessions/:sessionId/permissions/:permissionId/respond
GET  /api/opencode/events
```

## Definition of done

1. The Workspace UI never accesses `127.0.0.1:4096` directly.
2. OpenCode credentials remain inside the Vestara API.
3. Every exposed route is explicitly allowlisted.
4. Every session is bound to a Vestara workspace and owner.
5. OpenCode events appear in Vestara telemetry in real time.
6. Permission requests pass through Vestara governance.
7. Direct shell and dangerous administrative endpoints are blocked by default.
8. OpenCode outages produce degraded runtime health rather than crashing Vestara.
9. Requests carry execution, agent, workspace, session, and correlation identities.
10. Session diffs and execution results can be captured as verifier evidence.
11. Contract tests run against a real local OpenCode server.
12. OpenAPI compatibility is checked whenever the OpenCode version changes.

## Implementation status (2026-08-05)

- **OCV-001 (done)** — `@vestara/opencode-runtime` package, typed config with
  startup validation, HTTP client with server-side Basic auth, health check,
  managed runtime lifecycle, and normalized errors. `GET /api/opencode/health`
  returns a typed envelope when OpenCode is running and a normalized 503 when
  it is unavailable (verified live against OpenCode 1.18.8).
- **OCV-002 (done)** — discovery API: `GET /api/opencode/project`, `/path`,
  `/vcs`, `/providers`, `/agents`, `/commands` backed by typed client methods
  and renderer-free normalizers that strip provider env keys from responses.
  All routes verified live (181 providers, agents, commands, branch info).
- **OCV-003 (done)** — session gateway: `GET/POST/DELETE
  /api/opencode/sessions`, `GET /api/opencode/sessions/:id`,
  `/sessions/status`, `/sessions/:id/todos`, `/sessions/:id/diff`,
  `/sessions/:id/abort`. Includes an in-memory session binding registry
  (`OpenCodeSessionBinding`), workspace-ownership enforcement
  (`requireSessionOwnership` → 403/404), and renderer-free todo/diff
  normalizers. Verified live: create → get (ownership) → status → todos →
  diff → abort → delete → 404 after delete.
- **OCV-004 (done)** — message execution: `GET/POST
  /api/opencode/sessions/:id/messages`, `POST .../messages/async`,
  `POST .../command`, and `POST /api/opencode/executions/cancel`. Typed client
  methods (`listMessages`, `sendMessageAsync`, `runCommand`) with renderer-free
  `normalizeMessages`; execution correlation via
  `sessionRegistry.correlateExecution`/`findByExecution` maps an execution ID to
  its bound session so cancellation aborts the in-flight model turn. Verified
  live: sync message with reply, history, async dispatch (202), slash commands
  (`review`, `plan`), and execution cancellation (`cancelled: true`).
- **OCV-005 (done)** — event bridge: `OpenCodeEventBridge` holds a single
  persistent upstream SSE connection, normalizes each frame into a typed
  `OpenCodeBridgeEvent` (category `server`/`session`/`message`/`permission`/
  `unknown` with session/message/part ids), coalesces high-frequency
  `message.part.delta` frames into aggregated events, and publishes
  `opencode.*` envelopes onto the kernel EventBus — where the workspace wildcard
  subscriber already fans them out to WebSocket clients. `GET
  /api/opencode/events` is a server-sent event stream filtered by session
  ownership; `/api/opencode/health` reports live bridge metrics. This also fixed
  `parseSseFrame` to read the event type from the JSON body (`properties`) that
  OpenCode emits instead of an SSE `event:` header. Verified live: connected
  bridge, correct event types (session/message/part delta/status), coalesced
  deltas, and 48 events received / 35 published with zero drops.
- **OCV-006 (done)** — permission governance: `OpenCodePermissionRequest`
  normalization + risk classification (`safe`/`sensitive`/`dangerous`) for
  `permission.asked` / `permission.v2.asked` payloads, an in-memory
  `InMemoryPermissionRegistry` (pending/approved/rejected/expired records with
  workspace ownership via `requirePendingPermission`), and the event bridge
  records incoming permission asks. `GET /api/opencode/permissions` lists
  pending requests; `POST /api/opencode/sessions/:id/permissions/:permissionId/respond`
  enforces session ownership, validates the decision, forwards the upstream
  reply (`once`/`always`/`reject`), records an immutable audit entry
  (`opencode.permission.approve/reject`), and resolves the record. This also
  fixed `respondToPermission`, which previously sent `{response: allow|deny}`
  and was rejected by upstream (`Expected "once" | "always" | "reject"`).
  Verified live: pending listing, ownership 404s, invalid-decision rejection,
  and upstream schema acceptance (404 vs 400 body check).
- **OCV-007 (done)** — engineering evidence: `summarizeOpenCodeExecution`
  normalizes a session's message history, diff, and todos into a
  verifier-readable `OpenCodeExecutionEvidence` summary (outcome, changed-file
  counts, todo progress) with `renderOpenCodeExecutionEvidence` for compact
  text rendering. `POST /api/opencode/sessions/:id/evidence` enforces session
  ownership, fetches messages/diff/todos upstream, writes an immutable
  `VerificationEvidenceBundle` through the evidence pipeline (content-addressed
  diff artifact + manifest + confidence), appends an
  `opencode.execution.completed` engineering event with the session→execution
  correlation, and `GET .../evidence` returns the stored bundle. The evidence
  pipeline is now exposed on `WorkspaceContext.evidencePipeline`. Verified
  live: message run → capture → bundle (2 messages, passed check, very-high
  confidence) persisted and readable via both the opencode and generic
  `/api/evidence/bundles/:executionId` endpoints, with the engineering event at
  seq 1362 in the event store.
- **OCV-008 (done)** — contract and compatibility guard. The OpenCode 1.18.8
  OpenAPI document is pinned at `packages/opencode-runtime/openapi/opencode.openapi.json`
  with deterministic checksum `6e553fc2c1eba76c0767fa126415bfb06df87c890f54c7df964fdbb41ba988a3`
  (`opencode.openapi.sha256`). `normalizeOpenApiDocument` strips volatile
  metadata (descriptions, examples, servers, operation ids) and canonicalizes
  keys/arrays before hashing, so formatting never changes the checksum. The diff
  engine classifies changes as breaking / potentially-breaking / compatible and
  detects removed endpoints/methods, type changes, required-property additions,
  enum removals vs additions, and schema removal. Generated internal contracts
  live in `src/generated/opencode-contracts.ts` (472 schemas) with
  `Known... | unknown:${string}` enum tolerance so additive upstream enum values
  degrade gracefully. Commands: `opencode:spec:fetch` (write normalized
  candidate), `opencode:spec:generate` (regenerate contracts),
  `opencode:spec:check` (compare candidate/live vs pinned; exit 1 on breaking),
  `opencode:spec:update` (explicit maintainer workflow). CI runs a contract
  guard that regenerates and diffs the generated contracts plus checks the
  pinned schema — it never runs `spec:update`. `GET /api/opencode/compatibility`
  reports live-vs-pinned status, emits `opencode.contract.*` telemetry, appends
  an `opencode.contract.*` engineering event, and persists an immutable
  compatibility evidence bundle. Verified live: compatible report with matching
  checksums, breaking-candidate exit 1, additive-candidate warning + exit 0,
  and contract evidence bundle + event at seq 1365.
- **Complete** — all eight OCV-00x milestones shipped: the OpenCode integration
  is now operational, governed, observable, and verifiable.
