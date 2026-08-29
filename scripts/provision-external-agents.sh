#!/usr/bin/env bash
set -euo pipefail

# Provision external coding-agent CLIs on a Vestara host: OpenAI Codex, Claude
# Code, and Google Gemini CLI. Installs them as global npm packages and makes
# the resulting bin dir available to the `vestara` service account so
# packages/external-runtime discovery (codex / claude / gemini executables)
# finds them.
#
# Non-interactive, idempotent, and never touches host power operations.

if [[ ${EUID} -ne 0 ]]; then
  echo 'Provisioning requires root; rerun with sudo.' >&2
  exit 1
fi

for command in npm; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

PREFIX=${VESTARA_NPM_PREFIX:-/usr/local}
NPM_BIN="${PREFIX}/bin"

if [[ ${PREFIX} == / || ${PREFIX} == /etc || ${PREFIX} == /usr ]]; then
  echo "Refusing unsafe npm prefix: ${PREFIX}" >&2
  exit 1
fi

echo "Installing external coding-agent CLIs (npm prefix ${PREFIX})..."
npm install -g --prefix "${PREFIX}" @openai/codex @anthropic-ai/claude-code @google/gemini-cli

if ! getent group vestara >/dev/null; then
  groupadd --system vestara
fi
if ! getent passwd vestara >/dev/null; then
  useradd --system --gid vestara --home-dir /var/lib/vestara --shell /usr/sbin/nologin vestara
fi

# Ensure the service account can execute the CLIs regardless of shell PATH.
install -d -m 0755 "${NPM_BIN}"
for binary in codex claude gemini; do
  if [[ -e "${NPM_BIN}/${binary}" ]]; then
    chmod 0755 "${NPM_BIN}/${binary}"
  fi
done

# Expose the bin dir to the Vestara service account via an environment file.
# The API unit sources this file (see os/systemd/vestara-api.service).
if [[ ! -e /etc/vestara/vestara.env ]]; then
  install -d -m 0755 /etc/vestara
fi
if ! grep -q '^PATH=' /etc/vestara/vestara.env 2>/dev/null; then
  printf 'PATH=%s\n' "${NPM_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" >> /etc/vestara/vestara.env
  chmod 0644 /etc/vestara/vestara.env
fi

echo "Verifying executables..."
for binary in codex claude gemini; do
  if command -v "${binary}" >/dev/null 2>&1 || [[ -x "${NPM_BIN}/${binary}" ]]; then
    printf '  ✓ %s\n' "${binary}"
  else
    printf '  ! %s not found on PATH (%s)\n' "${binary}" "${NPM_BIN}" >&2
  fi
done

echo "Provisioning complete."
