# @vestara/tools-browser

Governed browser / computer-use tools for the Agent Harness Tool Runtime.

`browser.navigate`, `browser.snapshot`, and `browser.screenshot` are read-only and
run automatically. `browser.click` and `browser.type` are medium-risk interactions
(allowed with notification). `browser.close` releases the shared browser session.

Navigation is confined to the configured base origin plus any explicit
`allowedOrigins` or per-origin policy entries (`*` allows any http/https target);
`data:` and `javascript:` URLs are rejected.

Information governance is enforced per origin: `originPolicies` attach a
classification, retention policy, and redaction mode to a target origin.
`secrets` redaction masks credential-like tokens in snapshot text; `full`
redaction replaces snapshot text and refuses to return screenshot pixels
(raw pixels cannot be selectively redacted). Every evidence artifact carries
governance metadata (origin, route, classification, derived information risk,
redaction status, retention policy, requesting agent) and a `replay` block with
the session's interaction trace (PCS-026 `run-scenario` steps), so the action
sequence is retained with the evidence. Abort signals cancel in-flight
navigation and reset the page; browser pages are isolated per agent:task.

Tools share one lazy-launched Playwright Chromium session per ToolRuntime
instance; Chromium provisioning is an ops prerequisite
(`npx playwright install chromium`).
