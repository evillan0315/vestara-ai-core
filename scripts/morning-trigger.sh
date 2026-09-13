#!/usr/bin/env bash
set -euo pipefail
LOG=/tmp/vestara-schedules.log
export EXECUTED_AT=$(date -Iseconds)
DATE="$EXECUTED_AT"
echo "[$DATE] morning-trigger start (executedAt=$EXECUTED_AT)" >> "$LOG"

# 1) Try AgentSchedule run-due (LLM-powered assistant summary)
RESP=$(/usr/bin/curl -s -X POST http://127.0.0.1:3001/api/schedules/run-due || echo '{"ran":0,"error":"curl failed"}')
echo "[$DATE] run-due response: $RESP" >> "$LOG"

# 2) Generate deterministic details
REPO_HEALTH=$( {
  echo "Branch: $(git -C /home/user/projects/vestara/vestara-ai-core branch --show-current 2>&1)"
  echo "Last commits:"
  git -C /home/user/projects/vestara/vestara-ai-core log --oneline -5 2>&1 | sed 's/^/  - /'
  echo "Status:"
  git -C /home/user/projects/vestara/vestara-ai-core status --porcelain 2>&1 | head -20 | sed 's/^/  /' || echo "  clean"
  if [ -d /home/user/projects/vestara/vestara-ai-core/dist ]; then echo "Build: dist exists"; else echo "Build: MISSING dist (run bash build-order.sh)"; fi
} 2>&1 )
WORKSPACE_STATUS=$( cat /home/user/projects/vestara/vestara-ai-core/.vestara/workspace.json 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"id: {d['id']}\nfingerprint: {d['fingerprint']['gitCommit'][:8]} on {d['fingerprint']['gitBranch']}\nlanguage: {d.get('analysis',{}).get('language','?')} / {d.get('analysis',{}).get('packageManager','?')}\nlast fingerprinted: {d['fingerprint']['fingerprintedAt']}\")" 2>&1 || echo "workspace.json unreadable" )
ACTIVITY=$( /usr/bin/curl -s http://127.0.0.1:3001/api/opencode/sessions?limit=3 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join([f\"- {s['title'][:60]} ({s['agent']}) {s['time']['updated']}\" for s in d.get('sessions',[])]))" 2>&1 || echo "sessions unavailable" )

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
  /usr/bin/curl -s http://127.0.0.1:3001/api/schedules 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join([f\"- {s['agent_id']} {s['frequency']} next {s['next_run_at']} last:{s['last_status']}\" for s in d.get('schedules',[])]))" 2>&1 || echo "- schedules unavailable"
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
req = urllib.request.Request("http://127.0.0.1:3001/api/morning-briefings", data=data, headers={"Content-Type":"application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"[python] POST briefing status {resp.status}: {resp.read().decode()[:500]}")
except Exception as e:
    print(f"[python] POST briefing failed: {e}")
PY
cat "$OUT" >> "$LOG"
echo "[$DATE] morning-trigger done (executedAt=$EXECUTED_AT)" >> "$LOG"
