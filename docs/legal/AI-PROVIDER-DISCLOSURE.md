---
title: Vestara AI Provider Disclosure (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# AI Provider Disclosure — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Discloses transmission behavior, not provider terms. No provider
> retention, training-use, or privacy guarantee is stated — none evidenced.

## 1. Architecture (CURRENT)

```text
Assistant turn → ProviderExecutor → OpenCode adapter → localhost:4096
→ configured provider/model → streamed response (SSE)
```

- Evidenced: `apps/api` assistant/conversation path; `AssistantBindingResolver`
  validates against the OpenCode provider catalog; `/api/opencode/config` and
  `/api/opencode/config/providers` expose configured/effective projections
  with API keys stripped; live-agent trials use `.env` credentials (gitignored).
- Configured providers/models are deployment-specific (observed counts in
  `AGENTS.md` are runtime observations, not constants). Catalog ≠ configured ≠
  enabled ≠ selected (`AGENTS.md` integration-boundary rules).

## 2. What may be transmitted (CURRENT)

When an external provider is used, selected prompts, conversation context,
files/repository excerpts, tool results, metadata, or other authorized
information may be transmitted to that provider according to the
provider/integration configuration. **Do not assume information remains local:**
if an external model is selected, transmission is the mechanism, not an
anomaly.

## 3. Separation of policies

- Vestara's drafts govern Vestara's handling. Each provider's own terms,
  privacy practices, retention, and training-use policies govern the
  provider's handling. Users/administrators must consult the configured
  provider's terms. Vestara states no provider-side guarantees.

## 4. Credentials

- Provider credentials live in `.env` (gitignored, never committed per
  `AGENTS.md`). API projections strip keys. Redaction at logging/persistence
  boundaries (`packages/external-runtime/src/redact.ts`) is defense-in-depth,
  not proof against disclosure. Credential-rotation, vaulting, and scoping
  requirements are UNKNOWN — **LEGAL REVIEW REQUIRED** for any hosted/cloud
  posture (PLANNED cloud workers per VES-BASELINE-001).

## 5. Withheld / future

- Provider inventory per deployment; per-provider data-flow mapping; retention/
  training-use positions; regional-processing claims; human-review disclosure.
  All UNKNOWN — **LEGAL REVIEW REQUIRED**. Per-deployment provider matrices
  are future RAG-retrievable metadata (see `README.md`).
