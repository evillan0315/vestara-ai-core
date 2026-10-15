---
title: "Governance — Volume Overview"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "approved"
owner: "@chief-architect"
last-reviewed: "2025-07-23"
next-review: "2026-01-23"
tags: ["governance", "constitution", "rules", "lifecycle"]
---

# Volume 00: Governance
## The Constitution, Rules, and Lifecycle That Govern All of Vestara

> **Mission**: Define the supreme authority documents that govern every decision, architecture, and implementation in the Vestara ecosystem.

---

## 📋 Volume Contents

```
00-governance/
│
├── README.md                              ← This file
├── 01-ai-constitution.md                  ← Master prompt for AI agents
├── 02-engineering-rules.md                ← Non-negotiable engineering standards
├── 03-ai-development-lifecycle.md         ← AIDL — AI Development Lifecycle
├── 04-decision-log.md                     ← Architectural Decision Records
├── 05-compatibility.md                    ← AI agent compatibility (Claude, OpenCode, etc.)
├── 06-ai-development-framework.md         ← VADF — Vestara AI Development Framework
├── 07-ai-operating-system-architecture.md ← AI OS architecture
├── 08-product-constitution.md             ← Product decision framework
├── 09-capability-catalog.md              ← Capability specification catalog
├── 10-capability-validation-framework.md  ← Capability validation methodology
├── 11-language.md                         ← Terminology, naming conventions, event naming
├── 12-information-stewardship.md          ← Information Stewardship & Data Governance
├── 13-architectural-validation.md         ← Architectural validation & evolution cycle
├── adr/                                   ← Architecture Knowledge Graph (AKG)
│   ├── README.md                          ← AKG model, edge types, graph rules
│   ├── ADR-100-ai-organization.md
│   ├── ADR-101-conversation-architecture.md
│   ├── ADR-102-vds-framework-agnostic.md
│   ├── ADR-103-workspace-native-context.md
│   └── ADR-104-evidence-based-verification.md
```

---

## 📜 Governance Hierarchy

```
VESTARA_CONSTITUTION.md  ← Supreme authority (root level)
        │
        ▼
01-ai-constitution.md   ← Master prompt for all AI agents
        │
        ▼
02-engineering-rules.md ← Non-negotiable rules enforced by CI
        │
        ▼
03-ai-development-lifecycle.md ← AIDL workflow
        │
        ▼
04-decision-log.md      ← Immutable record of decisions
        │
        ▼
05-compatibility.md     ← AI agent integration (Claude, OpenCode, etc.)
        │
        ▼
06-ai-development-framework.md ← VADF methodology
07-ai-operating-system-architecture.md ← AI OS architecture
08-product-constitution.md ← Product decision framework
09-capability-catalog.md ← Capability specification catalog
10-capability-validation-framework.md ← Capability validation
11-language.md ← Terminology & naming conventions
12-information-stewardship.md ← Information Stewardship & Data Governance
adr/ADR-100-ai-organization.md ← AI Organization Over AI Assistant
adr/ADR-101-conversation-architecture.md ← Conversation as Independent Architecture
adr/ADR-102-vds-framework-agnostic.md ← Framework-Agnostic Design System
adr/ADR-103-workspace-native-context.md ← Workspace-Native Context
adr/ADR-104-evidence-based-verification.md ← Evidence-Based Verification
```

---

## 🔗 Cross-References

| Document | Supersedes/Maps To |
|----------|-------------------|
| `VESTARA_CONSTITUTION.md` | Root-level constitution |
| `AI_INSTRUCTION.md` | Maps to 01-ai-constitution.md |
| `AI_RULES.md` | Maps to 02-engineering-rules.md |
| `AI_AGENTS.md` | Maps to 06-ai-development-framework.md |
| `AI_CONTEXT.md` | Current project state |

---

## Related documents

- [Vestara AI Development Framework (VADF)](06-ai-development-framework.md)
- [AI Operating System Architecture](07-ai-operating-system-architecture.md)
- [Vestara Product Constitution](08-product-constitution.md)
- [Vestara Capability Catalog](09-capability-catalog.md)
- [Capability Validation Framework](10-capability-validation-framework.md)
- [Vestara Language & Terminology](11-language.md)
- [Information Stewardship & Data Governance](12-information-stewardship.md)
- [Architectural Validation & The Vestara Evolution Cycle](13-architectural-validation.md)



**END OF GOVERNANCE VOLUME OVERVIEW**

*Governance makes Vestara predictable, consistent, and self-sustaining.*
