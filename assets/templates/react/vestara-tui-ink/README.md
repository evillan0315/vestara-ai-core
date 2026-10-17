# @vestara/tui — Real Ink TUI

This is the real implementation for the restructured screenshot.

Restructure fixes:
- Left nav: active cyan left border + bg, icons, counts
- Center: you/assistant bubbles, not raw you: hello
- Right: cards Session/Context/Agent/Model/Files/Tools/Quick Actions with amber headers, green dots
- Top: V logo + Connected status + kbd hints
- Bottom: > prompt + slash commands /add /model /clear /export

Run:
pnpm install
VESTARA_REPO=./data pnpm --filter @vestara/tui dev
# or: pnpm --filter @vestara/tui dev:tui

Live WebSocket:
- Tries ws://localhost:8080/ws/conversation (from apps/api)
- Falls back to offline mock when API not running — per spec: offline fails cleanly
- Provider-agnostic: opencode (default), local, ollama on-demand (no auto-start)

Engineering rules:
- No global config touched — repo-local identity only
- Parameterized queries only in DB (checked in guards)
- Portable SSD spec — VESTARA_REPO=./data persists
- Raw http+ws, no Fastify
