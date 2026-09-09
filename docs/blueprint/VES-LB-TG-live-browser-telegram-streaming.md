# VES-LB-TG — Live Browser + Telegram Streaming

> **The Live Browser belongs to Vestara's browser/execution platform. Telegram is a remote viewing and control channel for it.**

This prevents building a special "Telegram browser" that later has to be rewritten for the Global Assistant, Activity Room, desktop, or mobile.

## Target Experience

```
You — Telegram

"Open the Vestara website and check the marketplace."

                ↓

        Global Assistant
                ↓
        Browser Execution
                ↓
        Live Browser Session
                ↓
       Chromium / Playwright
                ↓
     ┌─────────────────────┐
     │   Browser viewport  │
     │                     │
     │   live interaction  │
     └─────────────────────┘
          │          │
          │          ├────► Vestara Live Browser UI
          │          ├────► Activity Room
          │          └────► Floating Assistant
          │
          ▼
   Telegram Projection
          │
          ▼
 screenshot / stream
 + status + controls
```

The browser session remains authoritative inside Vestara. Telegram only observes it and submits authorized control intents.

## Architecture Principles

1. **Browser is a Vestara execution capability** — not a Telegram feature
2. **Telegram observes and controls** — does not own the browser
3. **Canonical events converge** — transport does not converge
4. **Single authoritative execution** — one browser per session
5. **Governed control** — risk-classified actions with approval flow

## Streaming Model

Three distinct streaming tiers:

```
Vestara UI       15–30 FPS eventually (WebSocket/WebRTC)
Telegram         event-driven snapshots (adaptive frame capture)
Activity Room    semantic browser events (canonical events)
```

### Adaptive Frame Capture

```
Browser frame
     ↓
Change detector
     ↓
Did meaningful visual change occur?
     │
   No ─────► discard
     │
    Yes
     ↓
Rate limiter
     ↓
Encode
     ↓
Projection
```

Capture modes:

| Mode | FPS | Trigger |
|------|-----|---------|
| Idle | 0–0.2 | No activity |
| Navigation | 1–2 | Page loading |
| Interaction | 2–5 | User/agent action |
| Stable page | event only | Page settled |
| Explicit screenshot | immediate | Manual request |

## Browser Platform Boundary

Generic browser packages (not coupled to Playwright):

```
packages/

browser-types/          # Canonical types
browser-runtime/        # Runtime port interface
browser-playwright/     # Playwright adapter
browser-projection/     # Frame pipeline + projection
```

Architecture:

```
Global Assistant
       ↓
BrowserIntent
       ↓
BrowserExecution
       ↓
BrowserRuntimePort
       ↓
Playwright Adapter
       ↓
Chromium
```

Playwright is a bounded execution substrate, not Vestara authority.

## Canonical BrowserSession

```ts
interface BrowserSession {
  id: string;
  workspaceId: string;
  executionId?: string;
  conversationId?: string;
  status: BrowserSessionStatus;
  currentUrl: string;
  title: string;
  viewport: Viewport;
  runtimeBinding: RuntimeBinding;
  createdAt: string;
  updatedAt: string;
}
```

Lifecycle:

```
CREATED → STARTING → READY → NAVIGATING → INTERACTIVE → IDLE → CLOSING → CLOSED
                                                                        ↓
                                                                      FAILED
```

## Browser Observations

Emitted by browser runtime, translated to canonical semantic events:

```
browser.started
browser.ready
navigation.started
navigation.completed
navigation.failed
page.changed
page.loaded
frame.updated
element.clicked
element.focused
input.changed
download.started
download.completed
upload.requested
dialog.opened
permission.requested
console.message
network.request
network.failure
browser.closed
browser.failed
```

## Browser Command Contract

Canonical operations with risk classification:

### LOW Risk
- navigate
- scroll
- inspect
- screenshot
- read page

### MEDIUM Risk
- form input
- download
- upload
- clipboard

### HIGH Risk
- submit form
- send message
- modify remote data
- delete
- purchase
- publish
- deploy

## Telegram Integration

### Initiation Flow

```
Telegram message
      ↓
ChannelMessage
      ↓
Global Assistant
      ↓
Intent
      ↓
Browser Execution
```

Telegram does **not** parse browser intent itself.

### Live-View Projection

```
┌──────────────────────────────┐
│ LIVE BROWSER                 │
│                              │
│     [latest screenshot]      │
│                              │
├──────────────────────────────┤
│ GitHub                       │
│ github.com/Vestara-Tech/...  │
│                              │
│ ● Connected                  │
│ Last update: now             │
│                              │
│ ◀  ▶  ↻   Screenshot         │
│                              │
│ [Interact] [Assistant]       │
│ [Activity] [Stop]            │
└──────────────────────────────┘
```

Prefer editing/replacing existing projection over generating hundreds of chat messages.

### Telegram Interaction Mode

Natural language preferred:

```
"Click Sign In."
"Scroll down."
"Open Marketplace."
"Fill the email field."
"Go back."
"Take a screenshot."
"What's on this page?"
```

Button controls as fallback:

```
[Back] [Forward] [Reload]
[Scroll Up] [Scroll Down]
[Tabs] [Screenshot]
[Ask Assistant] [Stop]
```

### Element Interaction

Interactive page map for precise interaction:

```
Interactive elements

1. Sign In
2. Marketplace
3. Documentation
4. Search
5. Get Started
```

Telegram selection:

```
callback → ChannelAction → BrowserControlIntent → Authorization → Browser execution
```

Never expose raw Playwright selectors to Telegram.

## Telegram Approval Flow

For governed actions:

```
Approval Required

Browser BR-104

The agent wants to:

Submit deployment configuration

Target: production
Risk: HIGH

[Approve] [Deny] [Open in Vestara]
```

Flow:

```
Telegram callback → Principal validation → Permission decision → Vestara Policy → Browser execution
```

Telegram never directly instructs Playwright.

## Browser Verification + Evidence

A browser task produces:

```
URL visited
viewport
screenshots
DOM observations
console errors
network failures
interaction sequence
test assertions
final page state
duration
```

Then:

```
Browser Execution → Verification → Evidence
```

Example:

```
Marketplace Verification

✓ Page loaded
✓ 24 modules rendered
✓ Search functional
✓ No failed API requests
⚠ 2 console warnings

Evidence
4 screenshots
17 network requests
8 browser actions
```

Telegram receives compact summary.

## Screenshots as Artifacts

```
Browser → Screenshot → ExecutionArtifact → Artifact storage
                                              ├──► Global Assistant
                                              ├──► Activity Room
                                              ├──► Evidence
                                              └──► Telegram projection
```

Telegram receives delivery copy/reference. It does not own the authoritative screenshot.

## Human/Agent Control Arbitration

```ts
type ControlOwner = 'human' | 'agent' | 'shared' | 'none';
```

When user chooses **Take Control**:

```
Agent browser actions → Paused → Human control
```

**Return to Agent** restores execution.

Prevents agent and user from fighting over the same page.

## Resource Management

```ts
interface BrowserRuntimePool {
  maxConcurrentBrowsers: number;
  maxContexts: number;
  idleTimeout: number;
  sessionTimeout: number;
  memoryThreshold: number;
  cpuThreshold: number;
}
```

Lifecycle: Acquire → Use → Idle → Suspend/Close → Release

One Telegram interaction must not accidentally create multiple Chromium instances.

## Browser Continuity

```
Conversation → Execution → BrowserSession → BrowserRuntimeBinding → BrowserRuntimeSession
```

Don't collapse conceptual levels. A conversation can outlive the browser. A browser can restart.

## Failure Recovery

Telegram reports useful states:

```
Browser disconnected
Attempting reconnect...
```

or:

```
Browser session ended unexpectedly.

Last page: https://...
Last screenshot: [image]

[Restart Browser] [Ask Assistant]
```

Do not silently create replacement sessions unless lifecycle policy permits.

## Browser Session Controls

Telegram commands:

```
/browser
/browser status
/browser screenshot
/browser stop
/browser restart
```

Live Browser UI:

```
Pause Agent | Take Control | Return Control | Screenshot | Record | Restart | Close
```

Control ownership must be explicit.

## Activity Room Projection

Semantic browser activity:

```
17:42:03  Global Assistant    Browser execution requested
17:42:04  Browser             Session BR-104 started
17:42:05  Browser             Navigating → localhost:3000
17:42:07  Browser             Page loaded
17:42:09  Browser Agent       Clicked Marketplace
17:42:11  Browser             Navigation completed
17:42:12  Console             2 warnings detected
17:42:14  Browser Agent       Captured screenshot
17:42:16  Verifier            Marketplace rendered successfully
```

Not raw Playwright events — those belong to diagnostics/runtime telemetry.

## Streaming Architecture

```
                         ┌── Semantic Events ──► Activity Room
                         │
Browser Runtime ─────────┼── State ────────────► Browser UI
                         │
                         └── Frames
                              ↓
                         Frame Pipeline
                              ↓
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Vestara Live UI      Telegram
```

Events carry references (frameId, artifactId, browserSessionId, timestamp, dimensions, contentType). Media travels through media/artifact path.

## Desktop Realtime Transport

For Vestara UI:

```
Browser Runtime → Frame Pipeline → WebSocket/WebRTC → Live Browser Surface
```

Selection determined by latency/resource testing. WebRTC attractive for high-frame-rate interactive remote browsing. Unnecessary for Telegram MVP.

## Telegram Transport

```
Canonical Browser State + Frame Pipeline → TelegramProjection → Delivery coalescer → Telegram API
```

Telegram outages cannot affect browser execution.

## Browser Profiles (Later Phase)

```ts
type BrowserProfileType = 'anonymous' | 'workspace' | 'personal' | 'testing' | 'automation';
```

Credentials/cookies/session storage need governed storage boundary. Never expose cookies/session tokens to Telegram or Activity Room.

## Recording (Later Phase)

```
BrowserSession → Recording → VideoArtifact
```

Telegram receives:

```
Browser recording available
Duration: 2m 48s
[View Recording]
```

## Milestone Program

| Phase | Description | Focus |
|-------|-------------|-------|
| **VES-LB-001** | Existing Browser / Playwright Audit | Audit |
| **VES-LB-002** | Browser Authority & Contract Baseline | Contract |
| **VES-LB-003** | @vestara/browser-types | Types |
| **VES-LB-004** | BrowserRuntimePort | Contract |
| **VES-LB-005** | Playwright Runtime Adapter | Implement |
| **VES-LB-006** | BrowserSession Lifecycle | Implement |
| **VES-LB-007** | Browser Observation Model | Implement |
| **VES-LB-008** | Navigation + Basic Interaction | Implement |
| **VES-LB-009** | Screenshot / Frame Pipeline | Implement |
| **VES-LB-010** | Browser Artifact Integration | Implement |
| **VES-LB-011** | Global Assistant Browser Execution | Integrate |
| **VES-LB-012** | Live Browser UI | UI |
| **VES-LB-013** | Floating Assistant Browser Projection | UI |
| **VES-LB-014** | Activity Room Browser Projection | Integrate |
| **VES-LB-015** | Telegram Browser Projection | Integrate |
| **VES-LB-016** | Telegram Remote Controls | Integrate |
| **VES-LB-017** | Cross-Surface Session Continuity | Verify |
| **VES-LB-018** | Browser Permission Model | Security |
| **VES-LB-019** | Telegram Approval Flow | Security |
| **VES-LB-020** | Human/Agent Control Arbitration | Verify |
| **VES-LB-021** | Console + Network Observability | Verify |
| **VES-LB-022** | Browser Verification + Evidence | Verify |
| **VES-LB-023** | Resource / Single-Flight Controls | Verify |
| **VES-LB-024** | Recovery + Reconnection | Verify |
| **VES-LB-025** | Responsive Live Browser UI | Verify |
| **VES-LB-026** | Security Hardening | Security |
| **VES-LB-027** | Performance / Resource Verification | Verify |
| **VES-LB-028** | Production Dogfood | Evidence |
| **VES-LB-029** | Evidence | Evidence |
| **VES-LB-030** | FREEZE | Freeze |

Each milestone retains discipline: **Audit → Contract → Implement → Verify → Dogfood → Evidence → Freeze.**

## First Vertical Slice

Deliberately smaller than final architecture:

```
Telegram
   │
   │ "Open https://example.com"
   ▼
Global Assistant
   ▼
Execution
   ▼
BrowserRuntimePort
   ▼
Playwright
   ▼
Chromium
   │
   ├── browser.started
   ├── navigation.completed
   └── screenshot
           │
           ├────► Activity Room
           ├────► Global Assistant
           └────► Telegram
```

Telegram receives:

```
✓ Page loaded

https://example.com

[latest screenshot]

[Back] [Reload]
[Ask Assistant] [Stop]
```

This single proof validates: Telegram ingress, identity/workspace/conversation correlation, Global Assistant orchestration, browser execution authority, Playwright isolation, screenshot artifacts, canonical events, Activity Room projection, Telegram delivery, and cross-surface continuity.

Only after stable: higher-frequency streaming, remote element interaction, browser profiles, uploads/downloads, recording, voice commands, and WebRTC-grade live control.

## Architecture Traceability

- VES-TG-001: Telegram Interaction Platform
- VES-LB-001 through VES-LB-030: Live Browser milestones
- @vestara/browser-types, browser-runtime, browser-playwright, browser-projection
