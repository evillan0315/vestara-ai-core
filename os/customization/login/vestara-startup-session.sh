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

# Entry resolution. No onboarding flow exists yet, so the default is login.
# When the flow lands it writes $ONBOARDING_PENDING on first boot and moves
# it to $ONBOARDING_COMPLETE at completion — no script change required then.
ENTRY="login"
if [[ -f $ONBOARDING_PENDING ]]; then
  ENTRY="onboarding"
elif [[ -f $ONBOARDING_COMPLETE ]]; then
  ENTRY="login"
fi

exec chromium --kiosk "$API_BASE/startup?entry=$ENTRY"
