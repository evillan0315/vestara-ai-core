# PCS-014 — Plugin Ecosystem

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-014 |
| Name | Plugin Ecosystem |
| Version | 1.0 |
| Status | Implemented (v1.5) |

---

## Goal

Introduce controlled extensibility to the Vestara platform. Plugins become first-class enterprise-governed capabilities with identity, permissions, workspace hooks, and audit events.

## Architecture

```
Plugin Registry
      |
      +── Plugin: GitHub Integration
      |     - Permissions: repository:read
      |     - Hooks: after-verify, after-approve
      |
      +── Plugin: Jira Connector
      |     - Permissions: collaboration:read
      |     - Hooks: after-plan, after-approve
      |
      +── Plugin: Slack Notifier
            - Permissions: collaboration:read
            - Hooks: after-verify, after-approve
```

## Plugin Model

```typescript
interface PluginDefinition {
  id: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  permissions: PluginPermission[];
  hooks: string[];
  status: 'active' | 'disabled';
  createdAt: string;
}

interface PluginPermission {
  resource: string;
  action: 'read' | 'write' | 'execute';
}

interface PluginExecution {
  id: string;
  pluginId: string;
  hook: string;
  status: 'success' | 'failed';
  duration: number;
  timestamp: string;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `plugin list` | List installed plugins |
| `plugin install <id>` | Install a plugin |
| `plugin remove <id>` | Remove a plugin |
| `plugin toggle <id>` | Enable/disable a plugin |
| `plugin info <id>` | Show plugin details |

## Built-in Plugins

| Plugin | Description | Hooks |
|--------|-------------|-------|
| `vestara/github` | GitHub issue/pr integration | after-verify, after-approve |
| `vestara/jira` | Jira ticket integration | after-plan, after-approve |
| `vestara/slack` | Slack notifications | after-verify, after-approve |
| `vestara/logs` | Structured log export | after-execution |
