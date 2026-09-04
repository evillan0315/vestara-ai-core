---
title: Capability Registry
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# Capability Registry

Index of all product capabilities with CSP status, implementation version, and verification status.

---

## Engineering Lifecycle

| # | Capability | Command | Artifact | Version | CSP | Status |
|---|-----------|---------|----------|---------|-----|--------|
| 1 | Repository Comprehension | `vestara open .` | RepositoryWorkspace | v0.3.0 | ✅ CSP-001 | ✅ |
| 2 | Repository Explanation | `vestara explain <target>` | Explanation | v0.3.3 | ✅ CSP-002 | ✅ |
| 3 | Planning | `vestara plan <goal>` | Plan | v0.4 | ✅ CSP-003 | ✅ |
| 4 | Implementation | `vestara implement <plan-id>` | ChangeSet | v0.5/v2.6 | ✅ CSP-004 | ✅ |
| 5 | Verification | `vestara verify <cs-id>` | VerificationReport | v0.6/v2.7 | ✅ CSP-005/017 | ✅ |
| 6 | Collaboration | `vestara collaborate` | CollaborationRecord | v0.7 | ✅ CSP-006 | ✅ |
| 7 | Agent Runtime | `vestara agent` | AgentDefinition | v0.8 | ✅ CSP-007 | ✅ |
| 8 | Knowledge Graph | `vestara memory` | KnowledgeNode | v0.9 | ✅ CSP-008 | ✅ |

## Workspace Platform

| # | Capability | Command | Artifact | Version | CSP | Status |
|---|-----------|---------|----------|---------|-----|--------|
| 9 | Engineering Workspace | `workspace create` | EngineeringSession | v1.0 | ✅ CSP-009 | ✅ |
| 10 | Workspace UI | (web app) | React dashboard | v1.1 | ✅ CSP-010 | ✅ |
| 11 | Remote Agent Execution | `cloud job submit` | CloudJob | v1.2 | ✅ CSP-011 | ✅ |
| 12 | Multi-Repository Intelligence | `org search` | Organization | v1.3 | ✅ CSP-012 | ✅ |
| 13 | Enterprise Organizations | `enterprise team` | Team, Policy | v1.4 | ✅ CSP-013 | ✅ |
| 14 | Plugin Ecosystem | `plugin list` | PluginDefinition | v1.5 | ✅ CSP-014 | ✅ |
| 15 | Cloud Execution Environment | `cloud status` | CloudWorker | v1.6 | ✅ CSP-015 | ✅ |

## OS Integration & Enrichment

| # | Capability | Command | Artifact | Version | CSP | Status |
|---|-----------|---------|----------|---------|-----|--------|
| 16 | AI OS Integration | `os status` | SystemInfo | v2.0 | ✅ CSP-016 | ✅ |
| 17 | Async Execution Engine | `exec <type>` | ExecJob | v2.1 | ✅ CSP-017-alt | ✅ |
| 18 | Auto-Indexing | `auto-index run` | — | v2.2 | ✅ CSP-018 | ✅ |
| 19 | Repository Health Scoring | (in `vestara open .`) | HealthScore | v2.3 | ✅ CSP-019 | ✅ |
| 20 | Predictive Engineering | `predict <goal>` | ImpactAssessment | v2.4 | ✅ CSP-020 | ✅ |
| 21 | Decision Intelligence | `recommend` | Decision | v2.5 | ✅ CSP-021 | ✅ |
| 22 | Traceable Implementation | `implement decision` | ChangeSet (enriched) | v2.6 | ✅ CSP-022 | ✅ |
| 23 | Outcome Verification | `verify plan/workspace` | VerificationReport (enriched) | v2.7 | ✅ CSP-023 | ✅ |

## CSP Status

All 23 capabilities now have CSP READMEs with implementation status, version, and artifact mapping.

## Legend

| Icon | Meaning |
|------|---------|
| ✅ CSP-017 | CSP exists and is current |
| 📋 | CSP not yet created |
| ✅ | Implemented and verified |
| 📋 Planned | Not yet implemented |

---

## CSP Status

| CSP | Capability | Status |
|-----|-----------|--------|
| CSP-017 | Outcome Verification | ✅ Complete |
| CSP-001 through CSP-016 | Prior capabilities | 📋 Not yet created |

All 23 capabilities are implemented. CSP-017 serves as the canonical template for future CSP creation.

---

## Marketplace (Engineering Exchange)

Catalog, discovery, resolution, and install orchestration above
`@vestara/extension-runtime`. See `docs/marketplace/MARKETPLACE-PLAN.md` and
`docs/marketplace/MARKETPLACE-V0.2-WORKSPACE-EXPERIENCE.md`.

| # | Capability | Command | Artifact | Version | CSP | Status |
|---|-----------|---------|----------|---------|-----|--------|
| 24 | Marketplace Catalog & Local Registry | `vestara marketplace list` | MarketplaceAsset | v9.2 | ✅ CSP-014 | ✅ |
| 25 | Marketplace Discovery, Search & Compatibility | `vestara marketplace search` | MarketplaceSearchResult | v9.2 | ✅ CSP-014 | ✅ |
| 26 | Marketplace Dependency Resolution (dry-run plans) | `vestara marketplace install --dry-run` | ResolutionPlan | v9.2 | ✅ CSP-014 | ✅ |
| 27 | Marketplace Install Orchestration & CLI | `vestara marketplace install/update/uninstall` | MarketplaceOperation | v9.2 | ✅ CSP-014 | ✅ |
| 28 | Marketplace Workspace API (operation DTOs) | `GET/POST /api/marketplace/*` | MarketplaceOperationDto | v9.2 | ✅ CSP-014 | ✅ |
| 29 | Marketplace Workspace UI + Operation Center | (Workspace UI) | Marketplace views | v9.2 | ✅ CSP-014 | ✅ |

Remote registries, publishing, and signature enforcement are not yet implemented.
