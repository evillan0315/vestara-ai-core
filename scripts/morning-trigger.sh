#!/usr/bin/env bash
set -euo pipefail
LOG=/tmp/vestara-schedules.log
export EXECUTED_AT=$(date -Iseconds)
DATE="$EXECUTED_AT"
# Resolve repo root dynamically (was hardcoded to /home/user/... which no longer exists)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
echo "[$DATE] morning-trigger start (executedAt=$EXECUTED_AT repo=$REPO_ROOT)" >> "$LOG"

# 0) Resolve API token (cron/systemd has no login session; use explicit env or provisioned session file)
# Precedence: $VESTARA_API_TOKEN > $VESTARA_SESSION_FILE > ~/.config/vestara/auth.json
VESTARA_TOKEN="${VESTARA_API_TOKEN:-}"
if [ -z "$VESTARA_TOKEN" ]; then
  SESSION_FILE="${VESTARA_SESSION_FILE:-$HOME/.config/vestara/auth.json}"
  if [ -f "$SESSION_FILE" ]; then
    VESTARA_TOKEN="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('token',''))" "$SESSION_FILE" 2>/dev/null || true)"
  fi
fi
export VESTARA_TOKEN
AUTH_ARGS=()
if [ -n "$VESTARA_TOKEN" ]; then
  AUTH_ARGS=(-H "Authorization: Bearer $VESTARA_TOKEN")
else
  echo "[$DATE] WARNING: no API token found (set VESTARA_API_TOKEN or log in to provision ~/.config/vestara/auth.json); authenticated calls will 401" >> "$LOG"
fi

# 1) Try AgentSchedule run-due (LLM-powered assistant summary)
RESP=$(/usr/bin/curl -s -X POST "${AUTH_ARGS[@]}" http://127.0.0.1:3001/api/schedules/run-due || echo '{"ran":0,"error":"curl failed"}')
echo "[$DATE] run-due response: $RESP" >> "$LOG"

# 2) Generate deterministic details
REPO_HEALTH=$( {
  echo "Branch: $(git -C "$REPO_ROOT" branch --show-current 2>&1)"
  echo "Last commits:"
  git -C "$REPO_ROOT" log --oneline -5 2>&1 | sed 's/^/  - /'
  echo "Status:"
  git -C "$REPO_ROOT" status --porcelain 2>&1 | head -20 | sed 's/^/  /' || echo "  clean"
  if [ -d "$REPO_ROOT/dist" ]; then echo "Build: dist exists"; else echo "Build: MISSING dist (run bash build-order.sh)"; fi
} 2>&1 )
export LIVE_HEAD="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>&1)"
WORKSPACE_STATUS=$( cat "$REPO_ROOT/.vestara/workspace.json" 2>&1 | python3 -c "import json,sys,os; d=json.load(sys.stdin); live=os.environ.get('LIVE_HEAD','?'); cached=(d.get('fingerprint') or {}).get('gitCommit','?')[:8]; print(f\"id: {d['id']}\nlive HEAD: {live} (manifest cached: {cached} on {(d.get('fingerprint') or {}).get('gitBranch','?')})\nlanguage: {d.get('analysis',{}).get('language','?')} / {d.get('analysis',{}).get('packageManager','?')}\nlast fingerprinted: {(d.get('fingerprint') or {}).get('fingerprintedAt','?')}\")" 2>&1 || echo "workspace.json unreadable" )
ACTIVITY=$( /usr/bin/curl -s "${AUTH_ARGS[@]}" http://127.0.0.1:3001/api/opencode/sessions?limit=3 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); ss=d.get('sessions',[]); print('auth required' if d.get('error') else ('(no sessions)' if not ss else '\n'.join([f\"- {str(s.get('title') or s.get('id','?'))[:60]} ({s.get('agent') or '?'} ) {((s.get('time') or {}).get('updated','?'))}\" for s in ss])))" 2>&1 || echo "sessions unavailable" )

# 3) Always generate fallback markdown so you get something even if LLM fails
OUT="/tmp/vestara-morning-$(date +%F).md"
{
  echo "# Morning Summary — vestara-ai-core — $EXECUTED_AT"
  echo ""
  echo "## Repo Health"
  echo "$REPO_HEALTH"
  echo ""
  echo "## Workspace Status"
  echo "$WORKSPACE_STATUS"
  echo ""
  echo "## Activity Room — OpenCode Sessions"
  echo "$ACTIVITY"
  echo ""
  echo "## Schedules"
  /usr/bin/curl -s "${AUTH_ARGS[@]}" http://127.0.0.1:3001/api/schedules 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); ss=d.get('schedules',[]); print('auth required (no token)' if d.get('error') else ('(no schedules)' if not ss else '\n'.join([f\"- {s.get('agentId') or s.get('agent_id','?')} {s.get('frequency','?')} next {s.get('nextRunAt') or s.get('next_run_at','?')} last:{s.get('lastStatus') or s.get('last_status','?')}\" for s in ss])))" 2>&1 || echo "- schedules unavailable"
} > "$OUT" 2>&1
echo "[$DATE] fallback summary written to $OUT" >> "$LOG"

# 4) POST to new Home/Overview + Activity API with exact executedAt (visible in both places)
# Write temp files for python JSON builder
printf "%s" "$REPO_HEALTH" > /tmp/repo_health.txt
printf "%s" "$WORKSPACE_STATUS" > /tmp/ws_status.txt
printf "%s" "$ACTIVITY" > /tmp/activity.txt
cat "$OUT" > /tmp/full_content.txt
python3 <<'PY' >> "$LOG" 2>&1
import json, urllib.request, os, pathlib
executed_at = os.environ["EXECUTED_AT"]
repo_health = pathlib.Path("/tmp/repo_health.txt").read_text()
workspace_status = pathlib.Path("/tmp/ws_status.txt").read_text()
activity = pathlib.Path("/tmp/activity.txt").read_text()
full_content = pathlib.Path("/tmp/full_content.txt").read_text()
payload = {
  "executedAt": executed_at,
  "summary": f"Morning briefing — vestara-ai-core — {executed_at}",
  "details": {
    "repoHealth": repo_health,
    "workspaceStatus": workspace_status,
    "activity": activity,
    "fullContent": full_content
  }
}
data = json.dumps(payload).encode()
headers = {"Content-Type":"application/json"}
token = os.environ.get("VESTARA_TOKEN", "")
if (token):
    headers["Authorization"] = f"Bearer {token}"
req = urllib.request.Request("http://127.0.0.1:3001/api/morning-briefings", data=data, headers=headers, method="POST")
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"[python] POST briefing status {resp.status}: {resp.read().decode()[:500]}")
except Exception as e:
    print(f"[python] POST briefing failed: {e}")
PY
cat "$OUT" >> "$LOG"
echo "[$DATE] morning-trigger done (executedAt=$EXECUTED_AT)" >> "$LOG"
