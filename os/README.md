# Vestara OS-0 Host Integration

OS-0 runs Vestara as a managed Linux host environment. It does not create an
ISO, install a bootloader, repartition disks, or modify the current machine
automatically.

## Runtime flow

```text
systemd
  -> vestara-host.service (read-only host preflight)
  -> opencode-server.service (OpenCode headless server on 127.0.0.1:4096)
  -> vestara-api.service (kernel, Host Runtime, Boot Runtime, workspace)
  -> vestara-workspace.service (readiness verification)
  -> vestara.target
```

The API persists boot evidence at `.vestara/os/boot-state.json`. The file is
mode `0600` and written atomically. Public read-only status surfaces are:

```bash
vestara host status
vestara boot status
curl http://127.0.0.1:3001/api/host
curl http://127.0.0.1:3001/api/boot
```

## Explicit host-mode installation

Installation remains an administrator action. Review and adapt the unit paths,
service account, workspace path, and writable directories before copying files.

```bash
sudo install -d -o vestara -g vestara /var/lib/vestara /etc/vestara
sudo install -m 0644 os/systemd/*.service os/systemd/vestara.target /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vestara.target
sudo systemctl start vestara.target
```

Create `/etc/vestara/vestara.env` with non-secret configuration such as
`VESTARA_REPO=/var/lib/vestara/workspace`. Secrets should use a dedicated
credential mechanism and must not be placed in repository files or logs.

Rollback is explicit and non-destructive:

```bash
sudo systemctl disable --now vestara.target
```

The supplied units use `NoNewPrivileges`, read-only host protection, private
temporary storage, and narrow writable paths. Host power operations remain
disabled in application code even when these services run as a system unit.

## OpenCode server service

`os/systemd/opencode-server.service` runs the OpenCode headless server on
`127.0.0.1:4096` and survives reboots via `vestara.target`. It binds only to
loopback and requires Basic authentication, so the workspace never talks to
OpenCode directly; the Vestara API exposes it through `/api/opencode/*`.

### Service account layout

The unit assumes the OpenCode binary is installed at
`/opt/vestara/.opencode/bin/opencode` and runs as the `vestara` service
account. OpenCode state is written under the service account's home
(`/var/lib/vestara/.local/share|state|config/opencode`), which is granted as a
narrow writable path while the host stays read-only.

On a developer machine the binary typically lives under the real user's home
(`~/.opencode/bin/opencode`). For a local, non-OS-0 service, adapt the unit:
point `ExecStart` and `ReadWritePaths` at the actual user and opencode home,
and drop `User=`/`Group=` so it runs as the invoking user.

### Developer-machine (user-level) install

`os/systemd/opencode-server.user.service` is a user-level unit for machines
where opencode runs under the logged-in user rather than a `vestara` service
account. It reads credentials from `~/.config/vestara/vestara.env`. Enable
lingering so the service starts at boot even before the user logs in:

```bash
loginctl enable-linger eddie
mkdir -p ~/.config/vestara
echo 'OPENCODE_SERVER_PASSWORD=<local-secret>' > ~/.config/vestara/vestara.env
chmod 600 ~/.config/vestara/vestara.env
sudo install -m 0644 os/systemd/opencode-server.user.service \
  /etc/systemd/system/opencode-server.service
systemctl --user daemon-reload
systemctl --user enable --now opencode-server.service
systemctl --user status opencode-server.service
```

Verify:

```bash
curl -s http://127.0.0.1:4096/global/health
curl -s http://127.0.0.1:3001/api/opencode/health
```

The Vestara API must be started with the same `OPENCODE_SERVER_PASSWORD`
available in its environment so `@vestara/opencode-runtime` can authenticate to
the server. For example, source `~/.config/vestara/vestara.env` before launching
the API, or add it to the API unit's `EnvironmentFile`.

Rollback:

```bash
systemctl --user disable --now opencode-server.service
```

### Credentials

The server password is read from `/etc/vestara/vestara.env` as
`OPENCODE_SERVER_PASSWORD`. The username defaults to `vestara` in the unit.
These credentials are consumed server-side by `@vestara/opencode-runtime` and
are never returned to workspace clients.

### Install and verify

```bash
sudo install -m 0644 os/systemd/opencode-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable opencode-server.service
sudo systemctl start opencode-server.service
sudo systemctl status opencode-server.service
curl -s http://127.0.0.1:4096/global/health
curl -s http://127.0.0.1:3001/api/opencode/health
```

Rollback is explicit and non-destructive:

```bash
sudo systemctl disable --now opencode-server.service
```

## External coding-agent runtimes

Vestara observes OpenAI Codex, Claude Code, and Google Gemini CLI as external
engineering workers through `@vestara/external-runtime` (API adapters, runtime
registry, workforce UI). Discovery is passive: the adapters look up the
`codex`, `claude`, and `gemini` executables on `PATH`, so the CLIs must be
installed on the host or baked into the image.

### Install on a running host

```bash
sudo scripts/provision-external-agents.sh
```

The script installs the three CLIs as global npm packages, ensures the `vestara`
service account exists, and appends the npm bin directory to
`/etc/vestara/vestara.env` (sourced by `vestara-api.service`). It is
non-interactive, idempotent, and never touches host power operations.

### Bake into the OS image

`scripts/build-vestara-image.sh` installs the three CLIs via global npm inside
the image chroot, so the built image discovers them at runtime. The intended
package set is declared in `os/customization/builder/packages.yaml` under
`external-runtime`.

### Verify discovery

Start the API and query the external-runtime surface:

```bash
curl -s http://127.0.0.1:3001/api/external-runtime/runtimes
vestara provider list          # model providers (not the same surface)
```

Discovered runtimes appear in the Workspace UI under Workforce / External
Runtimes with an integration level that reflects what was actually exercised.

