---
title: Systemd Startup Presentation
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-31
next-review: 2026-11-30
---

# Systemd Startup Presentation

`vestara.target` and its service units remain the lifecycle authority. Startup
branding may report readiness, but must not conceal failures. The production
API reload watcher is documented in [OS-API-SERVICE.md](../OS-API-SERVICE.md).

## Host boot tuning — eddie-Lenovo-Z50-70 (2026-10-31)

Local dev-host lean-boot record. Keepers: `opencode-server.service`
(user, enabled, `:4096`) + vestara API `node apps/api/dist/index.js`
(`:3001`) + `cloudflared tunnel → :3001` (child of API PID, not a unit —
never disable). Baseline: 4 cores, 7.7GiB RAM; before: 3.5Gi used /
212Mi free; after: ~3.0Gi used / 1.2Gi free.

Disabled on boot (all reversible, all verified `inactive` before recording):

- System: `ollama.service`, `redis-server.service`, `docker.service`,
  `docker.socket`, `containerd.service`, `nginx.service`,
  `postgresql.service` (+ `postgresql@16-main.service`) →
  `sudo systemctl disable <unit>`
- PG cluster autostart: `/etc/postgresql/16/main/start.conf` `auto` →
  `manual` (then `sudo systemctl daemon-reload`)
- User: `openclaw-gateway.service` (`:18789`, ~373MiB) →
  `systemctl --user disable openclaw-gateway.service`
- User indexer: `tracker-miner-fs-3.service` globally enabled, so
  `disable` does not stick → `systemctl --user mask
  tracker-miner-fs-3.service tracker-extract-3.service`
- Journal cap (was 1.6G): `/etc/systemd/journald.conf.d/vestara-perf.conf`
  with `SystemMaxUse=200M` + `RuntimeMaxUse=100M`, then `sudo systemctl
  restart systemd-journald.service` (freed ~1.4G; `pip cache purge` freed a
  further ~1.8G disk, one-off, no boot effect)

Re-enable: `sudo systemctl enable --now <unit>`; PG `manual` → `auto`;
`systemctl --user enable --now openclaw-gateway.service`; `systemctl --user
unmask tracker-miner-fs-3.service`. Expected post-reboot listeners: only
`:4096` + `:3001` (+ cloudflared `:20241`) — `:80`, `:11434`, `:18789`
closed.
