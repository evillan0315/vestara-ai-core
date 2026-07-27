# Contract Catalog

A centralized index of all platform contracts across architectural, domain, lifecycle, capability, persistence, plugin, enterprise, and OS layers.

---

## Summary

| Contract | Type | Owner | Version | Source |
|----------|------|-------|---------|--------|
| Kernel Boot Sequence | Runtime | Platform | 1.0 | `packages/kernel/src/index.ts` |
| Service Lifecycle | Runtime | Platform | 1.0 | `packages/shared/src/index.ts` |
| Event Bus | Runtime | Platform | 1.0 | `packages/event-bus/src/index.ts` |
| AIProvider | Runtime | Platform | 1.0 | `packages/shared/src/index.ts` |
| ContextAssembler | Runtime | Platform | 1.0 | `packages/context/src/index.ts` |
| ConversationService | Runtime | Platform | 1.0 | `packages/conversation/src/index.ts` |
| ActionRuntime | Runtime | Platform | 1.0 | `packages/action/src/index.ts` |
| PermissionEngine | Runtime | Platform | 1.0 | `packages/permission/src/index.ts` |
| StreamProcessor | Runtime | Platform | 1.0 | `packages/stream/src/index.ts` |
| WorkspaceRuntime | Runtime | Workspace | 1.0 | `packages/workspace/src/workspace-runtime.ts` |
| RepositoryWorkspace | Domain | Workspace | 1.0 | `packages/workspace/src/types.ts` |
| Plan | Domain | Planning | 1.0 | `packages/workspace/src/types.ts` |
| ChangeSet | Domain | Execution | 1.0 | `packages/workspace/src/types.ts` |
| VerificationReport | Domain | Verification | 1.0 | `packages/workspace/src/types.ts` |
| CollaborationRecord | Domain | Governance | 1.0 | `packages/workspace/src/types.ts` |
| AgentDefinition | Domain | Intelligence | 1.0 | `packages/workspace/src/types.ts` |
| KnowledgeNode | Domain | Memory | 1.0 | `packages/workspace/src/types.ts` |
| EngineeringSession | Domain | Workspace | 1.0 | `packages/workspace/src/types.ts` |
| Organization | Domain | Enterprise | 1.0 | `packages/workspace/src/types.ts` |
| PluginDefinition | Domain | Extension | 1.0 | `packages/workspace/src/types.ts` |
| CloudJob | Domain | Infrastructure | 1.0 | `packages/workspace/src/types.ts` |
| SystemInfo | Domain | OS | 1.0 | `packages/workspace/src/types.ts` |
| WorkspaceStatus | Lifecycle | Workspace | 1.0 | `packages/workspace/src/types.ts` |
| PlanStatus | Lifecycle | Planning | 1.0 | `packages/workspace/src/types.ts` |
| ChangeSetStatus | Lifecycle | Execution | 1.0 | `packages/workspace/src/types.ts` |
| VerificationStatus | Lifecycle | Verification | 1.0 | `packages/workspace/src/types.ts` |
| ReviewStatus | Lifecycle | Governance | 1.0 | `packages/workspace/src/types.ts` |
| AgentExecutionStatus | Lifecycle | Intelligence | 1.0 | `packages/workspace/src/types.ts` |
| SessionStatus | Lifecycle | Workspace | 1.0 | `packages/workspace/src/types.ts` |
| PCS-001 | Capability | Product | 1.0 | `docs/PCS-001-repository-comprehension.md` |
| PCS-002 | Capability | Product | 1.0 | `docs/PCS-002-explain.md` |
| PCS-003 | Capability | Product | 1.0 | `docs/PCS-003-plan.md` |
| PCS-004 | Capability | Product | 1.0 | `docs/PCS-004-implement.md` |
| PCS-005 | Capability | Product | 1.0 | `docs/PCS-005-verify.md` |
| PCS-006 | Capability | Product | 1.0 | `docs/PCS-006-collaboration.md` |
| PCS-007 | Capability | Product | 1.0 | `docs/PCS-007-agent-runtime.md` |
| PCS-008 | Capability | Product | 1.0 | `docs/PCS-008-memory.md` |
| PCS-009 | Capability | Product | 1.0 | `docs/PCS-009-engineering-session.md` |
| PCS-010 | Capability | Product | 1.0 | `docs/PCS-010-workspace-ui.md` |
| PCS-011 | Capability | Product | 1.0 | `docs/PCS-011-agent-execution.md` |
| PCS-012 | Capability | Product | 1.0 | `docs/PCS-012-multi-repository.md` |
| PCS-013 | Capability | Product | 1.0 | `docs/PCS-013-enterprise.md` |
| PCS-014 | Capability | Product | 1.0 | `docs/PCS-014-plugin-ecosystem.md` |
| PCS-015 | Capability | Product | 1.0 | `docs/PCS-015-cloud-execution.md` |
| PCS-016 | Capability | Product | 1.0 | `docs/PCS-016-os-integration.md` |
| PCS-017 | Capability | Product | 1.0 | `docs/PCS-017-execution-engine.md` |
| PCS-018 | Capability | Product | 1.0 | `docs/PCS-018-predictive-engineering.md` |
| PCS-019 | Capability | Product | 1.0 | `docs/PCS-019-decision-intelligence.md` |
| ServiceContract | OS | Platform | 1.0 | `packages/workspace/src/service-contract.ts` |
| KernelService | OS | Platform | 1.0 | `packages/workspace/src/services.ts` |
| WorkspaceManagerService | OS | Platform | 1.0 | `packages/workspace/src/services.ts` |
| AgentDaemonService | OS | Platform | 1.0 | `packages/workspace/src/services.ts` |
| PluginRuntimeService | OS | Platform | 1.0 | `packages/workspace/src/services.ts` |
| CloudControllerService | OS | Platform | 1.0 | `packages/workspace/src/services.ts` |
| ImpactAssessment | Domain | Prediction | 1.0 | `packages/workspace/src/types.ts` |
| Decision | Domain | Decision | 1.0 | `packages/workspace/src/types.ts` |
| ExecJob | Domain | Execution | 1.0 | `packages/workspace/src/types.ts` |
| HealthScore | Domain | Quality | 1.0 | `packages/workspace/src/types.ts` |
| TrendReport | Domain | Verification | 1.0 | `packages/workspace/src/types.ts` |
| Workspace Manifest | Persistence | Workspace | 1.0 | `.vestara/workspace.json` |
| Plan Database | Persistence | Planning | 1.0 | `.vestara/plans/plans.db` |
| Impact Database | Persistence | Prediction | 1.0 | `.vestara/plans/plans.db` |
| Decision Database | Persistence | Decision | 1.0 | `.vestara/plans/plans.db` |
| Plan Database | Persistence | Planning | 1.0 | `.vestara/plans/plans.db` |
| Knowledge Database | Persistence | Memory | 1.0 | `.vestara/knowledge/chunks.db` |
| Workspace Events | Persistence | Audit | 1.0 | `.vestara/plans/plans.db` |
| Plugin Hooks | Extension | Plugin | 1.0 | `packages/workspace/src/plugin-runtime.ts` |
| Agent Permission | Governance | Intelligence | 1.0 | `packages/workspace/src/agent-permission.ts` |
| User Roles | Governance | Enterprise | 1.0 | `packages/workspace/src/types.ts` |
| Approval Policy | Governance | Enterprise | 1.0 | `packages/workspace/src/types.ts` |
| OS Service Registration | OS | Platform | 1.0 | `packages/workspace/src/os-service.ts` |

---

## Contract Types

| Type | Description | Versioned? | Stability |
|------|-------------|------------|-----------|
| **Runtime** | Service/interface contracts between platform packages | Via package version | Stable |
| **Domain** | Artifact schemas and relationships | Via document version | Additive only |
| **Lifecycle** | State machine transitions for domain artifacts | Via document version | Stable |
| **Capability** | PCS documents defining command behavior | Via PCS version | Versioned per release |
| **Persistence** | On-disk formats, schemas, manifest structures | Via schema version | Versioned |
| **Extension** | Plugin interfaces, hooks, and capability registration | Via plugin SDK version | Versioned |
| **Governance** | RBAC, policies, audit models | Via enterprise version | Stable |

---

## Architectural Layering (Enforced)

```
CLI / UI
    ↓ (may only import WorkspaceRuntime)
WorkspaceRuntime
    ↓ (may import knowledge, memory, reasoning, conversation)
Platform Services
    ↓ (no upward dependencies)
Kernel / Providers
```

### Build Order (enforced by build-order.sh)

```
shared → configuration → logger → metrics → event-bus → service-registry →
health → permission → stream → provider-runtime → providers/opencode →
context → memory → cognitive → knowledge → reasoning →
action → state-runtime → conversation → tools/filesystem →
workspace → kernel → cli
```
