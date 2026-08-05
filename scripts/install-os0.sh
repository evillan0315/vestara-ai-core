#!/usr/bin/env bash
set -euo pipefail

# Install Vestara as a host-mode systemd target on an existing Ubuntu system.
# This intentionally does not partition disks or install a bootloader.

if [[ ${EUID} -ne 0 ]]; then
  echo 'OS-0 installation requires root; rerun with sudo.' >&2
  exit 1
fi

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
INSTALL_ROOT=${VESTARA_INSTALL_ROOT:-/opt/vestara}
SERVICE_ROOT=/etc/systemd/system

if [[ ${INSTALL_ROOT} == / || ${INSTALL_ROOT} == /etc || ${INSTALL_ROOT} == /usr ]]; then
  echo "Refusing unsafe install root: ${INSTALL_ROOT}" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo 'rsync is required to install the runtime tree.' >&2
  exit 1
fi

if ! getent group vestara >/dev/null; then
  groupadd --system vestara
fi
if ! getent passwd vestara >/dev/null; then
  useradd --system --gid vestara --home-dir /var/lib/vestara --shell /usr/sbin/nologin vestara
fi

install -d -o vestara -g vestara /var/lib/vestara /var/lib/vestara/workspaces
install -d -o root -g root "${INSTALL_ROOT}"
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'node_modules/.cache/' \
  "${ROOT}/" "${INSTALL_ROOT}/"
install -d -o vestara -g vestara -m 0750 "${INSTALL_ROOT}/.vestara"

# The checkout may contain private, developer-only modes (for example 0600
# package manifests). Services run as `vestara`, so runtime files must be
# readable without making them writable by the service account.
find "${INSTALL_ROOT}" -type d -exec chmod 0755 {} +
find "${INSTALL_ROOT}" -type f -exec chmod 0644 {} +
find "${INSTALL_ROOT}" -type f -name '*.js' -exec chmod 0755 {} +

install -d -o root -g root /etc/vestara
if [[ ! -e /etc/vestara/vestara.env ]]; then
  printf '%s\n' 'VESTARA_REPO=/var/lib/vestara/workspaces/default' > /etc/vestara/vestara.env
  chmod 0644 /etc/vestara/vestara.env
fi

install -m 0644 -o root -g root "${ROOT}"/os/systemd/*.service "${ROOT}"/os/systemd/*.path "${ROOT}"/os/systemd/vestara.target "${SERVICE_ROOT}/"
chown -R root:root "${INSTALL_ROOT}"
chown vestara:vestara "${INSTALL_ROOT}/.vestara"
systemctl daemon-reload
systemctl enable vestara.target vestara-host.service vestara-api.service vestara-workspace.service vestara-api-reload.path
systemctl start vestara.target
systemctl --no-pager --full status vestara.target
