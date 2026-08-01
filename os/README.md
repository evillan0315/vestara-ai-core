# Vestara OS-0 Host Integration

OS-0 runs Vestara as a managed Linux host environment. It does not create an
ISO, install a bootloader, repartition disks, or modify the current machine
automatically.

## Runtime flow

```text
systemd
  -> vestara-host.service (read-only host preflight)
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
