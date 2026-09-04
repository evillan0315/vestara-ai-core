---
title: PCS-013 — Enterprise Organizations
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-013 — Enterprise Organizations

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-013 |
| Name | Enterprise Organizations |
| Version | 1.0 |
| Status | Implemented (v1.4) |

---

## Goal

Add enterprise-grade organizational structure on top of the multi-repository foundation. Introduce teams, projects, RBAC, approval policies, and audit compliance.

## Artifact Model

```typescript
interface Team {
  id: string;
  name: string;
  description: string;
  members: string[];
  role: 'admin' | 'engineer' | 'viewer';
}

interface Project {
  id: string;
  name: string;
  goal: string;
  repositories: string[];
  status: 'active' | 'archived';
}

interface ApprovalPolicy {
  id: string;
  name: string;
  artifactType: 'plan' | 'changeset' | 'verification';
  requiredApprovers: number;
  roles: string[];
}

interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  resource: string;
  details: string;
  timestamp: string;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `enterprise team create <name>` | Create a team |
| `enterprise team list` | List teams |
| `enterprise project create <name>` | Create a project |
| `enterprise project list` | List projects |
| `enterprise policy list` | List approval policies |
| `enterprise audit` | Show audit log |
| `enterprise status` | Enterprise overview |

## Related Documents

- PCS-012: `docs/PCS-012-multi-repository.md`
