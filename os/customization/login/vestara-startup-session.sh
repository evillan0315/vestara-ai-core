#!/usr/bin/env bash
# VOS-STARTUP-001 P3: XFCE session launcher for the Vestara startup route.
#
# Installed by scripts/build-vestara-image.sh at /usr/local/bin and started
# once per graphical login via /etc/xdg/autostart/vestara-startup.desktop.
# Waits for the Vestara API readiness gate, resolves the startup entry, then
# hands the screen to a chromium kiosk pointed at the /startup route. The
# route itself owns loading/ready/degraded presentation — this script only
# guarantees the browser opens exactly once per session.
set -u

API_BASE="${VESTARA_API_BASE:-http://127.0.0.1:3001}"
READY_URL="$API_BASE/api/health/ready"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/vestara"
ONBOARDING_COMPLETE="$CONFIG_DIR/onboarding-complete"
ONBOARDING_PENDING="$CONFIG_DIR/onboarding-pending"
# System marker dir written by POST /api/onboarding/begin|complete
# (VESTARA_ONBOARDING_MARKER_DIR; /var/lib/vestara/onboarding on the image).
SYSTEM_DIR="${VESTARA_ONBOARDING_MARKER_DIR:-/var/lib/vestara/onboarding}"

pending_present() { [[ -f $SYSTEM_DIR/onboarding-pending || -f $ONBOARDING_PENDING ]]; }
complete_present() { [[ -f $SYSTEM_DIR/onboarding-complete || -f $ONBOARDING_COMPLETE ]]; }

# Bounded wait for the readiness gate. If the API never becomes ready the
# browser still opens: /startup renders its degraded state with a
# diagnostics code instead of leaving a bare desktop.
READY_WAIT_SECS="${VESTARA_STARTUP_READY_WAIT:-120}"
deadline=$((SECONDS + READY_WAIT_SECS))
while ((SECONDS < deadline)); do
  if curl -fsS --max-time 3 "$READY_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Entry resolution. Completion is terminal: a complete marker anywhere wins
# over pending. Default is login until a flow writes the pending marker via
# POST /api/onboarding/begin and completes via /api/onboarding/complete.
ENTRY="login"
if pending_present && ! complete_present; then
  ENTRY="onboarding"
fi

exec chromium --kiosk "$API_BASE/startup?entry=$ENTRY"
