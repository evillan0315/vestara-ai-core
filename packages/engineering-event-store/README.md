# @vestara/engineering-event-store

Durable append-only engineering truth for Vestara. Events are stored in SQLite
with monotonic sequences, correlation/causation indexes, and a SHA-256 hash
chain. Immutable evidence manifests bind verification outcomes to an exact Git
commit, repository, scope, limitations, commands, artifacts, actor, and time.

Large evidence is stored through `ContentAddressedEvidenceStore`. Artifacts are
written once under their SHA-256 digest, deduplicated by content, and verified
against the immutable references held by an evidence manifest. Manifest
integrity and referenced-artifact integrity are separate checks.

The package also reconciles interrupted Agent Harness turns at startup and can
reconstruct a historical task/thread/tool/verification graph from persisted
events. Awaiting approvals are preserved; interrupted possible side effects are
never replayed automatically.

`DurableThreadRecoveryService` exposes explicit `resume`, `reconcile`, and
`abandon` operations. A possibly mutating interrupted turn cannot resume until
an operator records that its side effects were reconciled. Recovery writes a
durable checkpoint and truth event; resume creates a new queued turn rather
than replaying the interrupted turn.

The API exposes the foundation through:

- `GET /api/chat/truth/events`, `/integrity`, `/graph`, and `/status`
- `GET /api/chat/evidence` and `/api/chat/evidence/integrity`
- `GET /api/chat/evidence/artifacts/:sha256`
- `POST /api/chat/threads/:threadId/recovery`
