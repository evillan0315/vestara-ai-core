# @vestara/agent-performance

APE-001 — Agent Performance & Behavioral Evaluation.

Measures how effectively a model performs engineering work *inside Vestara
workflows* (workflow compliance, engineering effectiveness, conversation
efficiency, economic efficiency, opportunity discovery) rather than raw model
capability. Built on the ADR-012 verification-evidence kernel: performance is
captured as immutable `EvidenceSnapshot`s and comparisons follow the kernel's
comparability rules. Routing remains a separate policy decision — this package
only evaluates.

Roles are evaluated independently; there is never a single universal
"best model" score.
