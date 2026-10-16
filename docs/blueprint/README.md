---
title: README
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-15
next-review: 2026-11-15
---

# Vestara AI Core — Blueprint

**Canonical source:** This directory (`docs/blueprint/`) is the single source of truth for all Vestara architecture, governance, and implementation blueprints.

## Structure

```
docs/blueprint/
├── governance/                    # Foundational governance (copied from vestara-blueprint/00-governance)
│   ├── 01-ai-constitution.md
│   ├── 02-engineering-rules.md
│   ├── 03-ai-development-lifecycle.md
│   ├── 04-decision-log.md
│   ├── 05-compatibility.md
│   ├── 06-ai-development-framework.md
│   ├── 07-ai-operating-system-architecture.md
│   ├── 08-product-constitution.md
│   ├── 09-capability-catalog.md
│   ├── 10-capability-validation-framework.md
│   ├── 11-language.md
│   ├── 12-information-stewardship.md
│   ├── 13-architectural-validation.md
│   ├── nla-001-natural-language-authority-interpretation.md
│   ├── orb-ve-001.md
│   ├── osr-001-organizational-state-recovery.md
│   ├── README.md
│   └── adr/                       # Architecture Decision Records
├── AR-000-activity-architecture-audit.md
├── AR-001-activity-room-domain-contract.md
├── AR-001C-canonical-contract-consolidation.md
├── AR-001L-legacy-activity-migration.md
├── AR-001R-activity-room-package-migration.md
├── AR-002-canonical-projection-pipeline.md
├── AR-003-activity-query-realtime-delivery.md
├── AR-004-activity-room-workspace-experience.md
├── AR-005-global-assistant-architecture.md
├── AR-006-assistant-conversation-boundary.md
├── AR-006B-ownership-execution-verification.md
├── AR-007-floating-assistant-shell.md
├── AR-008-assistant-surface-context.md
├── AR-GLOBAL-ASSISTANT-LOCAL-OPENCODE.md
├── AR-PRODUCTION-ASSISTANT-429-AUDIT.md
├── ARX-015B-RECONCILIATION-PROPOSAL.md
├── DOCUMENTATION_V2.md
├── EVIDENCE-UX-001-visual-evidence-audit.md
├── EVIDENCE-UX-002-M2-secure-visual-serving.md
├── EVIDENCE-UX-002-M3-evidence-gallery.md
├── EVIDENCE-UX-002-M4-visual-evidence-viewer.md
├── EVIDENCE-UX-002-visual-evidence-ingestion.md
├── GA-CAP-001-global-assistant-capabilities.md
├── GA-CAP-003-assistant-capability-policy.md
├── GA-PROVIDER-001-provider-model-configuration-convergence.md
├── GA-SSE-001-opencode-event-stream.md
├── GA-SSE-002-true-continuous-streaming.md
├── GA-UI-004-active-turn-ux.md
├── GA-UI-005-rich-message-presentation.md
├── GA-UI-006-conversation-navigation.md
├── GA-UI-007-global-assistant-window-plan.md
├── GA-UI-008-global-assistant-launcher-dock.md
├── GA-UI-009-global-assistant-restructure-plan.md
├── GA-UX-PREMIUM-assistant-experience.md
├── GA-UX-PREMIUM-M3.1-live-evidence.json
├── GA-UX-PREMIUM-M3.2-live-evidence.json
├── GA-UX-PREMIUM-M3-execution-projection-contract.md
├── GA-UX-PREMIUM-M3-live-evidence.json
├── GA-UX-PREMIUM-M4A-code-edit-presentation.md
├── VES-LB-TG-live-browser-telegram-streaming.md
├── VES-PERF-001-bounded-data-loading-ui-runtime-performance.md
├── VES-REPO-repository-awareness-concurrent-change-governance.md
├── VESTARA-DEV-CONSOLE-RUNTIME-CONTROLS-FUTURE.md
├── VESTARA-INTELLIGENCE-AGENT-CATALOG-CLEANUP-PREFLIGHT.md
├── VESTARA-INTELLIGENCE-AGENT-CONTROL-CATALOG-AUTHORITY-AUDIT.md
├── VESTARA-INTELLIGENCE-AGENT-CONTROL-REMEDIATION-ACCEPTANCE.md
├── VESTARA-INTELLIGENCE-AGENT-CONTROL-REMEDIATION-PREFLIGHT.md
├── VESTARA-INTELLIGENCE-AGENT-HARNESS-WORKFLOW-E2E.md
├── VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md
├── VESTARA-INTELLIGENCE-DEVELOPMENT-PLAN.md
├── VESTARA-INTELLIGENCE-DIRECTORY-CONTRACT-AUDIT.md
├── VESTARA-INTELLIGENCE-DIRECTORY-CONTRACT-REMEDIATION.md
├── VESTARA-INTELLIGENCE-DUPLICATE-CREATION-PROVENANCE-AUDIT.md
├── VESTARA-INTELLIGENCE-GA0-AUTHORITY-AUDIT.md
├── VESTARA-INTELLIGENCE-GA2-PREFLIGHT.md
├── VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md
├── VESTARA-INTELLIGENCE-GA4-PREFLIGHT.md
├── VESTARA-INTELLIGENCE-HARNESS-HANG-AUDIT.md
├── VESTARA-INTELLIGENCE-IMPLEMENTATION-SUMMARY.md
├── VESTARA-INTELLIGENCE-M7-REPOSITORY-DIRECTORY-DEFECT.md
├── VESTARA-INTELLIGENCE-M7-RUNTIME-SESSION-CONTINUITY-AUDIT.md
├── VESTARA-INTELLIGENCE-OPENCODE-CONTRACT-REMEDIATION.md
├── VESTARA-INTELLIGENCE-OPENCODE-PROJECT-AUTHORITY-TRACE.md
├── VESTARA-INTELLIGENCE-OPENCODE-TRANSPORT-AUDIT.md
├── VESTARA-INTELLIGENCE-RUN-BINDING-AUDIT.md
├── VESTARA-INTELLIGENCE-RUN-BINDING-LIVE-EVIDENCE.md
├── VESTARA-INTELLIGENCE-RUN-BINDING-REMEDIATION.md
├── VESTARA-OVERVIEW-SCREEN.md
├── VESTARA-SHARED-UI-PLATFORM.md
└── VES-TG-001-telegram-integration.md
```

## Precedence

**`docs/blueprint/` (this directory) takes precedence** over `/home/user/projects/vestara/vestara-blueprint/00-governance/`.

The vestara-blueprint governance files have been copied into `docs/blueprint/governance/` to consolidate all blueprint artifacts in one canonical location. Any updates should be made here first.

## Related Directories

- `docs/architecture/` — Architecture documents
- `docs/governance/` — Active governance policies (UI-UX-GOVERNANCE.md, etc.)
- `docs/standards/` — Coding/engineering standards
- `docs/ADR/` — Architecture Decision Records (root level)