---
title: Vestara Terms of Service (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Terms of Service — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Not effective, not published, not a compliance declaration.
> Organization identity and jurisdiction are UNKNOWN (no evidence in
> repository) — **LEGAL REVIEW REQUIRED** before these terms can bind anyone.

## 1. What Vestara is (CURRENT)

- Vestara AI Core v0.3.0 is a private engineering-phase platform: runtime
  kernel and product services (`package.json`: `name: vestara-ai-core`,
  `private: true`, `description: "Vestara AI Core Runtime — Engineering Phase"`).
- CURRENT deployment: Standalone API (`http://127.0.0.1:3001`) + Workspace UI
  proxied to the API + Tauri desktop shell (`README.md`, `AGENTS.md`). CURRENT.
- PLANNED deployments per `docs/architecture/VES-BASELINE-001-*.md`: Vestara
  AI OS (installed), Vestara Live AI OS, Vestara CLI/Runtime, cloud/headless
  workers. Plan-level tooling exists (`scripts/os*-*.mjs`, `scripts/build-vestara-image.sh`,
  `os/`); installable AI OS images are PLANNED, not evidenced as shipped.

## 2. Scope of these terms (DRAFT)

These draft terms would cover use of Vestara deployments, the Workspace,
Marketplace packages, and integrations. Related drafts: `PRIVACY-POLICY.md`,
`ACCEPTABLE-USE-POLICY.md`, `MARKETPLACE-TERMS.md`, `AI-PROVIDER-DISCLOSURE.md`.

## 3. Accounts and identity

- CURRENT: repository evidence shows identity architecture in progress —
  canonical identity registry (`docs/IDENTITY-OWNERSHIP.md`), provider-neutral
  `ExternalIdentity` direction with Google OIDC / GitHub OAuth adapters at the
  boundary (planned milestone text in
  `packages/workspace/src/milestone-service.ts`), and target-architecture
  `HumanPrincipal` / `AgentPrincipal` separation
  (`docs/architecture/VES-BASELINE-001-*.md`, §§10–11). Account lifecycle,
  registration terms, and credential requirements are UNKNOWN — **LEGAL REVIEW REQUIRED**.
- No statement is made about who may create accounts, age requirements, or
  organizational tenancy. Withheld for lack of evidence.

## 4. External providers and third parties

- Use of external AI providers transmits authorized prompts/context/files/
  metadata per provider/integration configuration (`AI-PROVIDER-DISCLOSURE.md`).
  Third-party provider terms apply in addition to these terms. CURRENT
  (OpenCode-mediated execution, `apps/api` provider executor → `localhost:4096`).
- No provider retention guarantees are stated. Withheld — **LEGAL REVIEW REQUIRED**.

## 5. Marketplace

- Marketplace packages are third-party or publisher-supplied unless stated
  otherwise. Installation ≠ capability grant; availability ≠ authority
  (`MARKETPLACE-TERMS.md`, `MARKETPLACE-PACKAGE-POLICY.md`). CURRENT
  (resolution/install/verify pipeline in `packages/marketplace/src/`).

## 6. Acceptable use, security, privacy

- Governed by `ACCEPTABLE-USE-POLICY.md`, `SECURITY-POLICY.md`,
  `PRIVACY-POLICY.md`, `DATA-RETENTION-DELETION-POLICY.md` (all DRAFT).

## 7. Warranties, liability, termination, governing law

- Withheld. No evidence for warranty, liability, suspension/termination, or
  governing-law positions. **LEGAL REVIEW REQUIRED** for each.

## 8. Changes to these terms

- Terms versioning/publish workflow does not exist (future work). Changes must
  follow the RAG-assisted maintenance loop in `README.md` with human/legal
  approval. CURRENT: manual markdown only.

## Statements deliberately withheld

Organization name/jurisdiction; effective date; eligibility; fees; SLA;
warranty/liability; termination; governing law; dispute resolution.
