# Vestara API Service

The production API runs as `vestara-api.service` and is enabled through
`vestara.target`. The host installer and hardware-image builder install and
enable both the API service and its production-build watcher.

## Run and enable manually

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vestara-api.service
sudo systemctl enable --now vestara-api-reload.path
```

Check status and logs with:

```bash
systemctl status vestara-api.service vestara-api-reload.path --no-pager
journalctl -u vestara-api.service -f
```

## Automatic reload after a build

`vestara-api-reload.path` watches `/opt/vestara/apps/api/dist`. When the
production build changes that directory, systemd starts
`vestara-api-reload.service`, which runs:

```text
systemctl try-restart vestara-api.service
```

The watcher observes the deployed tree under `/opt/vestara`. Building a
separate checkout does not reload the installed service until that build is
copied or synchronized into `/opt/vestara`.

## Manual restart

```bash
sudo systemctl restart vestara-api.service
```
