---
title: Vestara Codex App Server - Systemd & Sandbox Configuration
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-20
next-review: 2026-10-20
---

# Vestara Codex App Server - Systemd & Sandbox Configuration

**Operational runbook - Debian - Vestara local development**
**Documented:** 20 September 2026

## 1. Purpose

This runbook records the Codex changes made on the Vestara Debian development
machine:

1. The persistent Codex `app-server` service on localhost port `4500`.
2. Boot-time startup through the user's systemd manager and lingering.
3. The Codex `config.toml` sandbox and approval configuration intended to let
   local Codex sessions edit the workspace, request approvals when necessary,
   and use outbound network access.

The service and sandbox settings solve different problems. `systemd` controls
availability and lifecycle of the app server. Codex `config.toml` controls
execution permissions for Codex sessions and turns. A running service does not
itself grant Git or network permissions.

## 2. Resulting Runtime Topology

```text
Debian boot
  -> systemd user manager (user)
     -> codex-app-server.service
        -> /home/user/.npm-global/bin/codex app-server
           -> ws://127.0.0.1:4500
           -> http://127.0.0.1:4500/readyz
           -> http://127.0.0.1:4500/healthz
```

The app server is intentionally bound to `127.0.0.1`. It is not exposed
directly to the LAN or Internet.

## 3. Codex App Server systemd Service

### 3.1 Service directory

```bash
mkdir -p ~/.config/systemd/user
```

Verified directory:

```text
/home/user/.config/systemd/user
```

### 3.2 Service unit

File:

```text
~/.config/systemd/user/codex-app-server.service
```

Contents:

```ini
[Unit]
Description=Codex App Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/user/.npm-global/bin/codex app-server --listen ws://127.0.0.1:4500
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

### 3.3 Load, enable, and start

```bash
systemctl --user daemon-reload
systemctl --user enable --now codex-app-server.service
```

Enabling the unit creates the `default.target.wants` symlink so the user
manager starts the service automatically.

### 3.4 Manual-server conflict encountered

A manually started Codex app server was already listening on port `4500`. The
systemd unit therefore entered an automatic restart loop and exited with status
`1`.

The manually owned process was stopped with `Ctrl+C`:

```bash
codex app-server --listen ws://127.0.0.1:4500
# Stop the manually-owned instance:
Ctrl+C
```

After the manual process released the port, systemd automatically retried and
acquired port `4500`.

### 3.5 Verified running state

```bash
systemctl --user status codex-app-server.service --no-pager
```

Verified state included:

```text
Active: active (running)
listening on: ws://127.0.0.1:4500
readyz: http://127.0.0.1:4500/readyz
healthz: http://127.0.0.1:4500/healthz
```

The restart counter observed during setup reflected the earlier port conflict
and was historical once the service reached a stable active state.

## 4. Start Codex at Boot Without Interactive Login

A user service normally follows the user's systemd manager. Lingering was
enabled so the user's manager can run at boot before an interactive desktop or
login session.

```bash
sudo loginctl enable-linger user
```

Verification:

```bash
loginctl show-user user -p Linger
```

Expected result:

```text
Linger=yes
```

## 5. Codex `config.toml` Permission Changes

The previous Codex session used `approval_policy = "never"`. That prevented
Codex from requesting permission for actions requiring escalation. Terminal
network access was also unavailable, and in the prior environment `.git`
metadata was read-only.

The intended local configuration is:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
network_access = true
```

### 5.1 Meaning of the settings

| Setting | Purpose | Operational effect |
| --- | --- | --- |
| `sandbox_mode = "workspace-write"` | Workspace filesystem access | Allows Codex commands to edit files inside the permitted workspace. |
| `approval_policy = "on-request"` | Interactive escalation path | Allows Codex to request approval when an action requires permissions beyond the current sandbox policy. |
| `network_access = true` | Outbound network in `workspace-write` | Allows commands running in the workspace-write sandbox to use network access. |

### 5.2 Important `.git` caveat

`workspace-write` does **not** guarantee that `.git` is writable in every Codex
environment. Some environments may keep `.git/` and `.codex/` protected or
read-only even when ordinary workspace files are writable.

This matches the earlier Vestara behavior: Codex could edit source files and
run verification, but `git add` failed because it could not create
`.git/index.lock`.

Therefore:

- `approval_policy = "on-request"` provides an interactive escalation path when
  the environment supports one.
- It should not be treated as a guarantee that `.git` automatically becomes
  writable.
- If the host/session mounts `.git` read-only with no escalation path, commit
  operations must be performed from an environment that grants Git metadata
  write access.

### 5.3 One-shot CLI equivalent

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

Persistent `config.toml` is preferred for the local service/session setup. The
CLI form is useful for testing or temporary overrides.

## 6. Reloading Codex After `config.toml` Changes

Because the app server is now systemd-owned, do not start a second manual
server on port `4500`.

After changing Codex configuration:

```bash
systemctl --user restart codex-app-server.service
```

Then verify:

```bash
systemctl --user status codex-app-server.service --no-pager
curl -fsS http://127.0.0.1:4500/readyz
curl -fsS http://127.0.0.1:4500/healthz
```

## 7. Routine Operations

| Task | Command |
| --- | --- |
| Restart after config change | `systemctl --user restart codex-app-server` |
| Check status | `systemctl --user status codex-app-server --no-pager` |
| Follow logs | `journalctl --user -u codex-app-server -f` |
| Show recent logs | `journalctl --user -u codex-app-server -n 100 --no-pager` |
| Stop temporarily | `systemctl --user stop codex-app-server` |
| Start | `systemctl --user start codex-app-server` |
| Disable automatic startup | `systemctl --user disable --now codex-app-server` |
| Re-enable | `systemctl --user enable --now codex-app-server` |
| Verify lingering | `loginctl show-user user -p Linger` |

## 8. Troubleshooting

### Service repeatedly exits with status 1

Check whether another process already owns port `4500`:

```bash
ps aux | grep -i '[c]odex'
ss -ltnp | grep ':4500'
```

If a manually launched `codex app-server` owns the port, stop that manual
process. Do not run both the manual server and the systemd service.

### Codex can edit files but cannot `git add` or commit

Check the active sandbox and approval policy. A protected `.git` directory is
distinct from ordinary workspace write access.

Use `on-request` so Codex has an escalation path when the environment permits
one. If the host/session itself mounts `.git` read-only with no escalation path,
use a session or environment with Git metadata write access.

### Codex terminal commands cannot reach GitHub or other network services

Confirm the persistent configuration contains:

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
```

Restart the app server after changing the configuration:

```bash
systemctl --user restart codex-app-server
```

## 9. Security Notes

- Keep the app server bound to `127.0.0.1` unless there is a deliberate
  authenticated remote-access design.
- Prefer `workspace-write` plus `on-request` over disabling the sandbox
  entirely.
- Network access increases capability and risk. Enable it for Vestara's
  networked Git and tool workflows while retaining approval boundaries for
  actions outside the sandbox.
- Do not use `--dangerously-bypass-approvals-and-sandbox` as the normal Vestara
  development configuration.
- Treat systemd service availability separately from per-turn and per-session
  sandbox policy.

## 10. Current Vestara Operational Standard

For the local Vestara development machine:

- Codex `app-server` is owned by the user's systemd manager.
- It automatically starts at boot through user lingering.
- It restarts on failure.
- It listens only on `127.0.0.1:4500`.
- Persistent Codex configuration changes are applied by restarting the systemd
  service.
- Codex development sessions use `workspace-write` with `on-request` approvals
  and explicit workspace-write network access.

Expected Git workflow:

```text
Codex edits and verifies in the workspace
  -> Git/network operation requires additional permission
     -> Codex requests approval
        -> approved operation proceeds
```

This replaces the previous `approval_policy = "never"` behavior, where Codex had
no approval path and could become permanently blocked from an operation
requiring escalation.

## 11. References

OpenAI Codex documentation consulted when establishing the configuration:

- Agent approvals and security
- Codex configuration
- Codex App Server documentation

Relevant official documentation includes the Codex approvals and security
guidance at `developers.openai.com/docs/agent-approvals-security`.

The operational commands and observed service state in this runbook are based
on the Vestara Debian machine configuration performed on 20 September 2026.
