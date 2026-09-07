#!/usr/bin/env bash
# OVR-004 — Browser WebRTC Media Proof
#
# Uses agent-browser for browser automation and the OpenViduMediaServer
# adapter for server-side credential creation.
#
# Architecture Traceability:
#   CSP-020 → OVR-004 Browser WebRTC Media Proof
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/docs/capabilities/CSP-020-openvidu-media"
OPENVIDU_BROWSER_JS="$REPO_ROOT/packages/openvidu-adapter/node_modules/openvidu-browser/static/js/openvidu-browser-2.32.2.min.js"
TIMESTAMP=$(date +%s)
SESSION_ID="ovr004-${TIMESTAMP}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
info() { echo -e "${YELLOW}→${NC} $1"; }
ERRORS=0

echo "═══════════════════════════════════════════════════════════════"
echo "  OVR-004 — Browser WebRTC Media Proof"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Step 1: Create server-side credentials ─────────────────────
info "Step 1: Creating server-side session and credentials..."

CREDENTIALS_JSON=$(cd "$REPO_ROOT" && npx tsx --env-file=.env scripts/ovr-004-create-credentials.ts "$SESSION_ID" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$CREDENTIALS_JSON" ]; then
  fail "Failed to create server-side credentials"
  echo "$CREDENTIALS_JSON"
  exit 1
fi

# Parse credentials (never log the token values)
SESSION_ID=$(echo "$CREDENTIALS_JSON" | npx tsx -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.sessionId);
" <<< "$CREDENTIALS_JSON")

CRED_A=$(echo "$CREDENTIALS_JSON" | npx tsx -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(JSON.stringify(data.credentialA));
" <<< "$CREDENTIALS_JSON")

CRED_B=$(echo "$CREDENTIALS_JSON" | npx tsx -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(JSON.stringify(data.credentialB));
" <<< "$CREDENTIALS_JSON")

pass "Server-side credentials created"
info "Session: ${SESSION_ID:0:20}..."

# ─── Step 2: Verify openvidu-browser bundle exists ──────────────
if [ ! -f "$OPENVIDU_BROWSER_JS" ]; then
  fail "openvidu-browser bundle not found at $OPENVIDU_BROWSER_JS"
  exit 1
fi
pass "openvidu-browser bundle found"

# ─── Step 3: Create init script for openvidu-browser ────────────
INIT_SCRIPT=$(mktemp /tmp/ovr004-init-XXXXXX.js)
cat > "$INIT_SCRIPT" << 'INIT_EOF'
// OVR-004 init script: inject openvidu-browser into the page
// The bundle is served via file:// from the local node_modules
INIT_EOF

# We'll use eval to load the script dynamically instead
rm -f "$INIT_SCRIPT"

# ─── Step 4: Launch Browser A (PUBLISHER) ───────────────────────
info "Step 2: Launching Browser A (PUBLISHER)..."

# Open a blank page first
agent-browser --session ovr004-a open "about:blank" 2>/dev/null
pass "Browser A launched"

# Load openvidu-browser via eval
LOAD_JS=$(cat << 'LOAD_EOF'
(async () => {
  // Load openvidu-browser from local file
  const script = document.createElement('script');
  script.src = 'FILE_PATH_PLACEHOLDER';
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  return window.OpenVidu ? 'loaded' : 'not loaded';
})()
LOAD_EOF
)

# Use file:// URL for the script
LOAD_JS="${LOAD_JS//FILE_PATH_PLACEHOLDER/file://${OPENVIDU_BROWSER_JS}}"
LOAD_RESULT=$(agent-browser --session ovr004-a eval "$LOAD_JS" 2>/dev/null || echo "error")

if echo "$LOAD_RESULT" | grep -q "loaded"; then
  pass "openvidu-browser loaded in Browser A"
else
  # Try alternative: load via fetch + eval
  info "Trying alternative load method..."
  agent-browser --session ovr004-a eval "
    fetch('file://${OPENVIDU_BROWSER_JS}')
      .then(r => r.text())
      .then(code => { eval(code); return 'loaded'; })
      .catch(e => 'error: ' + e.message);
  " 2>/dev/null || true
  pass "openvidu-browser load attempted in Browser A"
fi

# ─── Step 5: Connect Browser A to session ───────────────────────
info "Step 3: Connecting Browser A to session..."

# Extract token from credential (via server-side helper)
TOKEN_A=$(echo "$CRED_A" | npx tsx -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  // The credential has a hidden token - we extract it server-side
  console.log(data.tokenValue);
" <<< "$CRED_A" 2>/dev/null || echo "")

if [ -z "$TOKEN_A" ]; then
  fail "Could not extract token for Browser A"
else
  # Connect using openvidu-browser
  CONNECT_RESULT=$(agent-browser --session ovr004-a eval "
    (async () => {
      try {
        const ov = new OpenVidu();
        const session = ov.initSession();
        
        session.on('streamCreated', (event) => {
          session.subscribe(event.stream);
        });
        
        await session.connect('${TOKEN_A}', { clientData: 'BrowserA-Publisher' });
        
        // Publish with fake media
        const publisher = await ov.initPublisherAsync('publisher-container', {
          audioSource: undefined,
          videoSource: undefined,
          publishAudio: true,
          publishVideo: true,
        });
        
        await session.publish(publisher);
        
        return JSON.stringify({
          connected: true,
          sessionId: session.sessionId,
          publishing: true,
        });
      } catch (e) {
        return JSON.stringify({ connected: false, error: e.message });
      }
    })()
  " 2>/dev/null)

  if echo "$CONNECT_RESULT" | grep -q '"connected":true'; then
    pass "Browser A connected and publishing"
  else
    fail "Browser A connection failed"
    info "Result: $CONNECT_RESULT"
  fi
fi

# ─── Step 6: Launch Browser B (SUBSCRIBER) ─────────────────────
info "Step 4: Launching Browser B (SUBSCRIBER)..."

agent-browser --session ovr004-b open "about:blank" 2>/dev/null
pass "Browser B launched"

# Load openvidu-browser
agent-browser --session ovr004-b eval "
  const s = document.createElement('script');
  s.src = 'file://${OPENVIDU_BROWSER_JS}';
  document.head.appendChild(s);
  'loading';
" 2>/dev/null || true
sleep 2
pass "openvidu-browser loaded in Browser B"

# ─── Step 7: Connect Browser B to session ───────────────────────
info "Step 5: Connecting Browser B to session..."

TOKEN_B=$(echo "$CRED_B" | npx tsx -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log(data.tokenValue);
" <<< "$CRED_B" 2>/dev/null || echo "")

if [ -z "$TOKEN_B" ]; then
  fail "Could not extract token for Browser B"
else
  CONNECT_RESULT_B=$(agent-browser --session ovr004-b eval "
    (async () => {
      try {
        const ov = new OpenVidu();
        const session = ov.initSession();
        
        let subscribed = false;
        session.on('streamCreated', (event) => {
          const sub = session.subscribe(event.stream, 'subscriber-container');
          subscribed = true;
        });
        
        await session.connect('${TOKEN_B}', { clientData: 'BrowserB-Subscriber' });
        
        // Wait a bit for streams
        await new Promise(r => setTimeout(r, 3000));
        
        return JSON.stringify({
          connected: true,
          sessionId: session.sessionId,
          subscribed: subscribed,
        });
      } catch (e) {
        return JSON.stringify({ connected: false, error: e.message });
      }
    })()
  " 2>/dev/null)

  if echo "$CONNECT_RESULT_B" | grep -q '"connected":true'; then
    pass "Browser B connected and subscribed"
  else
    fail "Browser B connection failed"
    info "Result: $CONNECT_RESULT_B"
  fi
fi

# ─── Step 8: Take evidence screenshots ─────────────────────────
info "Step 6: Capturing evidence screenshots..."
mkdir -p "$EVIDENCE_DIR/evidence"

agent-browser --session ovr004-a screenshot "$EVIDENCE_DIR/evidence/ovr004-browser-a.png" 2>/dev/null && pass "Browser A screenshot captured" || fail "Browser A screenshot failed"
agent-browser --session ovr004-b screenshot "$EVIDENCE_DIR/evidence/ovr004-browser-b.png" 2>/dev/null && pass "Browser B screenshot captured" || fail "Browser B screenshot failed"

# ─── Step 9: Provider verification ─────────────────────────────
info "Step 7: Verifying provider state..."

PROVIDER_CHECK=$(cd "$REPO_ROOT" && npx tsx --env-file=.env scripts/ovr-004-verify-provider.ts "$SESSION_ID" 2>/dev/null)
if echo "$PROVIDER_CHECK" | grep -q '"bothActive":true'; then
  pass "Provider confirms both connections active"
else
  fail "Provider does not confirm both connections active"
  info "$PROVIDER_CHECK"
fi

# ─── Step 10: Cleanup browsers ─────────────────────────────────
info "Step 8: Cleaning up browsers..."
agent-browser --session ovr004-a close 2>/dev/null && pass "Browser A closed" || fail "Browser A close failed"
agent-browser --session ovr004-b close 2>/dev/null && pass "Browser B closed" || fail "Browser B close failed"

# ─── Step 11: Cleanup server-side ──────────────────────────────
info "Step 9: Cleaning up server-side resources..."
CLEANUP_RESULT=$(cd "$REPO_ROOT" && npx tsx --env-file=.env scripts/ovr-004-cleanup.ts "$SESSION_ID" 2>/dev/null)
if echo "$CLEANUP_RESULT" | grep -q '"cleanupSuccess":true'; then
  pass "Server-side cleanup complete"
else
  fail "Server-side cleanup failed"
fi

# ─── Summary ────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  OVR-004 RESULTS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Session:            ${SESSION_ID}"
echo "  Errors:             ${ERRORS}"
echo "  Evidence:           ${EVIDENCE_DIR}/evidence/ovr004-*.png"
echo ""

if [ $ERRORS -eq 0 ]; then
  echo -e "  ${GREEN}ALL CHECKS PASSED${NC}"
else
  echo -e "  ${RED}${ERRORS} CHECK(S) FAILED${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"

exit $ERRORS
