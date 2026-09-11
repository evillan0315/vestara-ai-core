---
title: VES-LEAN-003C — Capability Parking & Marketplace Catalog
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-10
milestone: VES-LEAN-003C
mode: bounded implementation
prerequisites: VES-LEAN-001, VES-LEAN-001A, VES-LEAN-002, VES-LEAN-003A, VES-LEAN-003B, VES-LEAN-003B.1
---

# VES-LEAN-003C — Capability Parking & Marketplace Catalog

## 1. Executive Summary

Implemented capability parking semantics and a minimal read-only Marketplace catalog:

- **40 known capabilities** classified in the dogfood profile
- **32 active** (required/eager), **1 lazy** (verification), **8 parked** (disabled)
- **Parking invariant preserved**: Parked != Deleted, Parked != Deprecated
- **Read-only catalog API**: `GET /api/catalog`, `/api/catalog/:id`, `/api/catalog/search`, `/api/catalog/parked`
- **15 focused tests** proving catalog correctness
- **ActivationPlan remains authority** — catalog is projection only

## 2. Authority Model

```
RuntimeProfile / ActivationPlan  (authority)
        |
        +--> runtime composition (what runs)
        |
        +--> Capability Catalog (projection)
                |
                +--> human-readable catalog (Marketplace)
```

Marketplace answers: "What capabilities does Vestara know about?"
ActivationPlan answers: "What should run?"

## 3. Canonical Capability Contract

Extended from VES-LEAN-002 `CapabilityDescriptor` with catalog metadata:

```typescript
interface CapabilityCatalogEntry {
  id: string;              // matches CapabilityDescriptor.id
  name: string;
  description: string;
  category: CapabilityCategory;
  parkingState: ParkingState;  // active | parked | experimental | unknown
  requirement: CapabilityRequirement;
  activation: CapabilityActivation;
  packages: string[];
  dependencies: string[];
  health: CapabilityHealth;    // verified | pass | fail | degraded | unknown
  documentation?: string[];
  evidence?: string[];
}
```

## 4. Lifecycle vs Parking Semantics

Frozen lifecycle: `Known → Installed → Enabled → Active`

Parking is an **orthogonal operational classification**:
- `active` = part of current runtime profile
- `parked` = deliberately excluded from dogfood (but known, inspectable, documented)
- `experimental` = available but not production-ready
- `unknown` = insufficient evidence

## 5. Dogfood Classification

| Category | Active | Parked | Total |
|----------|--------|--------|-------|
| Core | 13 | 0 | 13 |
| Assistant | 1 | 0 | 1 |
| Activity Room | 5 | 0 | 5 |
| Diagnostics | 1 | 0 | 1 |
| Execution | 5 | 1 | 6 |
| Provider | 3 | 2 | 5 |
| Evidence | 2 | 0 | 2 |
| Memory | 2 | 0 | 2 |
| Tools | 1 | 1 | 2 |
| Integration | 0 | 1 | 1 |
| OS | 0 | 2 | 2 |
| Marketplace | 1 | 0 | 1 |
| UI | 0 | 1 | 1 |
| **Total** | **33** | **8** | **40** |

## 6. Parked Capabilities

| Capability | Category | Reason |
|-----------|----------|--------|
| boot-runtime | OS | OS-0 integration, not dogfood |
| host-runtime | OS | OS-0 integration, not dogfood |
| browser-runtime | Tools | Browser product surface not required |
| telegram | Integration | Not part of dogfood surface |
| opencode-go-provider | Provider | Not needed for dogfood |
| openai-provider | Provider | Not needed for dogfood |
| worker-cluster | Execution | Single-node dogfood |
| dashboard-runtime | UI | No dashboard needed |

## 7. Parking Enforcement

**Implemented**: Parking state is represented canonically in the catalog. Runtime gating (VES-LEAN-003A) ensures parked capabilities are not constructed.

**Limitation**: The existing permission/mutation system does not yet enforce capability-scoped mutation ownership. Parked capabilities are gated at the **composition boundary** (not constructed), but agents could theoretically access parked package source. This is architecture debt for a future milestone.

## 8. Marketplace Catalog API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/catalog` | GET | Full capability catalog |
| `GET /api/catalog/:id` | GET | Single capability details |
| `GET /api/catalog/search?q=...` | GET | Search capabilities |
| `GET /api/catalog/parked` | GET | List parked capabilities |

All endpoints are **read-only**. Mutation operations return 405.

## 9. Files Changed

| File | Change |
|------|--------|
| `packages/types/src/capability-catalog.ts` | NEW — Catalog contract types + projection functions |
| `packages/types/src/index.ts` | Modified — added capability-catalog export |
| `packages/workspace/src/capability-catalog-service.ts` | NEW — Catalog service with enrichment data |
| `packages/workspace/src/index.ts` | Modified — added catalog exports |
| `apps/api/src/routes/catalog.ts` | NEW — Read-only catalog API routes |
| `packages/types/__tests__/capability-catalog.test.ts` | NEW — 15 focused tests |

## 10. Tests: 15 pass, all previous tests pass

## 11. Build: succeeds

---

> **VES-LEAN-003C FREEZE READY**
