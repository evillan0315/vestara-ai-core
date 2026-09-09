# VES-LB-TG — Live Browser + Telegram Streaming

> **The Live Browser belongs to Vestara's browser/execution platform. Telegram is a remote viewing and control channel for it.**

This prevents building a special "Telegram browser" that later has to be rewritten for the Global Assistant, Activity Room, desktop, or mobile.

## Runtime Substrate: agent-browser

**agent-browser** is Vestara's initial browser execution substrate. It provides:

- Persistent sessions with named/stateful sessions
- Ref-based accessibility snapshots (~200–400 tokens vs thousands for full DOM)
- WebSocket viewport stream with mouse, keyboard, and touch input
- Per-client FPS limiting and ack-based pacing
- Screenshot, network/debug tooling, video recording
- Native Rust CLI/daemon architecture with Linux binaries
- Remote browser provider integrations (Browserbase, Browserless, Kernel)

> **Vestara owns BrowserExecution and BrowserSession semantics. agent-browser owns browser automation and browser runtime mechanics.**

## Target Experience

```
You — Telegram

"Open the Vestara website and check the marketplac e."

                ↓

        Global Assistant
                ↓
        Browser Execution
                ↓
        BrowserRuntimePort
                ↓
    AgentBrowserRuntimeAdapter
                ↓
          agent-browser
          ┌─────┴─────┐
          │           │
      Commands     Stream
          │           │
          ▼           ▼
       Chrome    WebSocket Frames
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
6. **agent-browser is bounded execution** — not Vestara authority

## agent-browser Agent Workflow

The primary AI interaction path uses ref-based accessibility snapshots:

```
Global Assistant
       ↓
Browser task
       ↓
agent-browser snapshot -i

@e1 button "Sign In"
@e2 link "Marketplace"
@e3 textbox "Search"

       ↓
Agent reasoning
       ↓
click @e2
       ↓
new snapshot
```

Accessibility snapshots are deliberately compact and ref-based (~200–400 tokens), avoiding full DOM dumps into the model context.

## Streaming Model

Three distinct streaming tiers:

```
Vestara UI       15–30 FPS eventually (WebSocket from agent-browser)
Telegram         event-driven snapshots (throttled from agent-browser stream)
Activity Room    semantic browser events (canonical events)
```

### agent-browser Stream

agent-browser sessions expose a WebSocket streaming server:

```
agent-browser
      │
      ├──── Accessibility snapshots ───► Agent
      │
      ├──── Semantic commands ─────────► Browser
      │
      └──── WebSocket stream
                    │
                    ▼
          Vestara Stream Gateway
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    Live Browser UI      Telegram Projection
```

agent-browser streams contain:

```
seq
base64 JPEG
deviceWidth
deviceHeight
pageScaleFactor
scroll offsets
timestamp
```

Stream uses latest-first delivery (newer frames replace stale ones, not queueing).

### Stream Pacing

```text
Vestara desktop:     maxFps: 15, pacing: ack
Telegram:            event-driven / throttled
Activity Room:       semantic events only
```

With ack pacing, only one frame is in flight — newer frames replace stale ones rather than accumulating backlog. Ideal for low-resource Vestara host.

### Frame Capture Modes

| Mode | FPS | Trigger |
|------|-----|---------|
| Idle | 0–0.2 | No activity |
| Navigation | 1–2 | Page loading |
| Interaction | 2–5 | User/agent action |
| Stable page | event only | Page settled |
| Explicit screenshot | immediate | Manual request |

## Browser Platform Boundary

```
packages/

browser-types/              # Canonical types
browser-runtime/            # Runtime port, lifecycle, orchestration
agent-browser-runtime/      # agent-browser adapter (commands, snapshots, stream, recording)
browser-projection/         # Live state, activity projection, frame projection
```

Architecture:

```
Global Assistant ─┐
Telegram ─────────┤
Workflow ─────────┼──► browser-runtime
Verifier ─────────┘           │
                              ▼
                    agent-browser-runtime
                              │
                              ▼
                         agent-browser
```

`agent-browser-runtime` is the only package that understands agent-browser commands (`snapshot`, `click`, `fill`, stream ports, native session names).

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

### Session Mapping

Map, but do not equate:

```
Vestara BrowserSession
          │
          │ runtime binding
          ▼
agent-browser session
```

```ts
BrowserSession BR-104

runtime:
  kind: agent-browser
  nativeSessionId: vestara-br-104
```

Never make `BrowserSessionId = agent-browser session name` — that would leak runtime identity into the domain.

### Future Runtime Adapters

```
BrowserRuntimePort

├── AgentBrowserAdapter
├── RemoteAgentBrowserAdapter
├── BrowserbaseAdapter
└── FutureBrowserRuntime
```

agent-browser itself documents remote/browser-provider integrations (Browserbase, Browserless, Kernel, Remote Agent Browser), so Vestara could eventually gain remote browser execution without changing its BrowserExecution contract.

## Browser Observations

Emitted by agent-browser adapter, translated to canonical semantic events:

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

Raw agent-browser events belong to diagnostics/runtime telemetry. Activity Room consumes canonical semantic events.

## Browser Command Contract

Canonical operations with risk classification:

### LOW Risk
- navigate
- scroll
- inspect
- screenshot
- read page
- snapshot

### MEDIUM Risk
- form input (fill, type)
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
      ↓
BrowserRuntimePort
      ↓
AgentBrowserRuntimeAdapter
      ↓
agent-browser
```

Telegram does **not** parse browser intent itself. Telegram never directly instructs agent-browser.

### Live-View Projection

```
┌──────────────────────────────────────┐
│ LIVE BROWSER                         │
│                                      │
│         [latest frame]               │
│                                      │
├──────────────────────────────────────┤
│ GitHub                               │
│ github.com/Vestara-Tech/...          │
│                                      │
│ ● Connected                          │
│ Session BR-104                       │
│ Last update: now                     │
│                                      │
│ ◀  ▶  ↻   Screenshot                │
│                                      │
│ [Take Control] [Ask Assistant]       │
│ [Activity] [Stop]                    │
└──────────────────────────────────────┘
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
[Back]       [Reload]
[Scroll ↓]   [Screenshot]
[Take Control]
[Ask Assistant] [Stop]
```

### Ref-Based Telegram Interaction

agent-browser's refs give Telegram a clean interaction path:

```
agent-browser snapshot -i

@e1 button "Sign In"
@e2 link "Marketplace"
@e3 textbox "Search"
```

Telegram renders:

```
Interactive elements

1. Sign In
2. Marketplace
3. Search

[1 Sign In]
[2 Marketplace]
[3 Search]
```

Selection flow:

```
Telegram button
      ↓
ChannelAction
      ↓
BrowserInteractionReference
      ↓
Vestara authorization
      ↓
AgentBrowserRuntimeAdapter
      ↓
click @e2
```

Refs are **runtime-scoped ephemeral references** — they change after page state changes. Never expose `@e2` as a durable Vestara identity.

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

Telegram never directly instructs agent-browser.

## Human/Agent Control Arbitration

```ts
type ControlOwner = 'human' | 'agent' | 'shared' | 'none';
```

agent-browser's stream accepts mouse, keyboard, and touch events independently of frame delivery. This enables genuine pair browsing.

When user chooses **Take Control**:

```
Take Control
      ↓
Vestara BrowserControlAuthority
      ↓
Agent actions paused
      ↓
Human input enabled
      ↓
agent-browser WebSocket input
```

**Return to Agent** releases control and restores execution.

agent-browser's ability to accept input does not become authorization. Vestara still decides who may send that input.

```
┌─────────────────────────────────────────────────┐
│ Live Browser                     ● LIVE         │
├─────────────────────────────────────────────────┤
│                                                 │
│             agent-browser stream                │
│                                                 │
├─────────────────────────────────────────────────┤
│ Agent: Developer       Control: AGENT           │
│                                                 │
│ [Take Control] [Screenshot] [Record] [Stop]     │
└─────────────────────────────────────────────────┘
```

## Screenshots as Artifacts

```
Browser → Screenshot → ExecutionArtifact → Artifact storage
                                              ├──► Global Assistant
                                              ├──► Activity Room
                                              ├──► Evidence
                                              └──► Telegram projection
```

Telegram receives delivery copy/reference. It does not own the authoritative screenshot.

### Frame Artifact Classification

```
Live frame        ephemeral (not persisted)
Screenshot        artifact (persisted)
Verification shot evidence (persisted + indexed)
Recording         artifact (persisted)
```

Only significant frames become artifacts/evidence.

## Browser Verification + Evidence

A browser task produces:

```
URL visited
viewport
screenshots
DOM observations (from snapshots)
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

## Streaming Architecture

```
                         ┌── Semantic Events ──► Activity Room
                         │
agent-browser ───────────┼── State ────────────► Browser UI
          │              │
          │              └── Frames
          │                       ↓
          │              Vestara Stream Gateway
          │                       ↓
          │              ┌────────┴────────┐
          │              ▼                 ▼
          │        Live Browser UI    Telegram
          │                            (throttled)
          │
          └── Accessibility Snapshots ──► Agent
```

Events carry references (frameId, artifactId, browserSessionId, timestamp, dimensions, contentType). Media travels through media/artifact path.

## Desktop Realtime Transport

For Vestara UI, consume agent-browser WebSocket stream through controlled proxy:

```
agent-browser WS → Vestara Stream Gateway → WebSocket → Live Browser Surface
```

With ack pacing and FPS limiting built into agent-browser.

## Telegram Transport

```
agent-browser WS → Vestara Stream Gateway → Latest Frame Buffer → Telegram Frame Projector → Telegram Bot API
```

Telegram outages cannot affect browser execution.

## Activity Room Projection

Semantic browser activity — not raw agent-browser events:

```
17:41:02  You · Telegram
Check the Marketplace

17:41:03  Global Assistant
Browser execution created

17:41:04  Browser
BR-104 ready

17:41:05  Browser
Navigating to vestara...

17:41:07  Browser
Marketplace loaded

17:41:09  Developer
Inspecting interactive elements

17:41:11  Developer
Selected "Agent Tools"

17:41:13  Browser
Page changed

17:41:15  Verifier
Screenshot captured
```

No raw CDP or agent-browser CLI noise unless Diagnostics asks for it.

## Recording

agent-browser has video recording support (requires `ffmpeg` on PATH, already part of Vestara platform tooling).

```
BrowserSession → Recording → VideoArtifact
```

Telegram receives:

```
Browser recording completed
2m 14s

[View Recording]
```

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
Conversation → Execution → BrowserSession → BrowserRuntimeBinding → agent-browser session
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

## Browser Profiles (Later Phase)

```ts
type BrowserProfileType = 'anonymous' | 'workspace' | 'personal' | 'testing' | 'automation';
```

Credentials/cookies/session storage need governed storage boundary. Never expose cookies/session tokens to Telegram or Activity Room.

## Milestone Program

| Phase | Description | Focus |
|-------|-------------|-------|
| **VES-LB-001** | agent-browser Capability + Existing Vestara Browser Audit | Audit |
| **VES-LB-002** | Browser Authority & Runtime Contract | Contract |
| **VES-LB-003** | @vestara/browser-types | Types |
| **VES-LB-004** | BrowserRuntimePort | Contract |
| **VES-LB-005** | AgentBrowserRuntimeAdapter | Implement |
| **VES-LB-006** | Vestara BrowserSession ↔ agent-browser Session Binding | Implement |
| **VES-LB-007** | Snapshot + Runtime Reference Adapter | Implement |
| **VES-LB-008** | Navigation / Click / Fill / Scroll | Implement |
| **VES-LB-009** | agent-browser Stream Gateway | Implement |
| **VES-LB-010** | Live Browser Surface | UI |
| **VES-LB-011** | Human / Agent Control Arbitration | Verify |
| **VES-LB-012** | Global Assistant Browser Execution | Integrate |
| **VES-LB-013** | Floating Assistant Projection | UI |
| **VES-LB-014** | Canonical Browser Events | Implement |
| **VES-LB-015** | Activity Room Projection | Integrate |
| **VES-LB-016** | Screenshot / Artifact Pipeline | Implement |
| **VES-LB-017** | Telegram Live Browser Projection | Integrate |
| **VES-LB-018** | Telegram Browser Controls | Integrate |
| **VES-LB-019** | Telegram Natural-Language Browser Control | Integrate |
| **VES-LB-020** | Browser Permission / Approval Model | Security |
| **VES-LB-021** | Telegram Approval Flow | Security |
| **VES-LB-022** | Console + Network Diagnostics | Verify |
| **VES-LB-023** | Recording + Evidence | Verify |
| **VES-LB-024** | Resource / Single-Flight Management | Verify |
| **VES-LB-025** | Session Recovery | Verify |
| **VES-LB-026** | Security Hardening | Security |
| **VES-LB-027** | Low-Resource Performance Verification | Verify |
| **VES-LB-028** | Cross-Surface Dogfood | Evidence |
| **VES-LB-029** | Evidence | Evidence |
| **VES-LB-030** | FREEZE | Freeze |

Each milestone retains discipline: **Audit → Contract → Implement → Verify → Dogfood → Evidence → Freeze.**

## First Vertical Slice

The initial production proof:

```
Telegram
    │
    │ "Open example.com"
    ▼
Global Assistant
    ▼
BrowserExecution BR-001
    ▼
BrowserRuntimePort
    ▼
AgentBrowserRuntimeAdapter
    ▼
agent-browser
    │
    ├── open
    ├── snapshot
    └── WebSocket stream
           │
     ┌─────┴──────────────┐
     ▼                    ▼
Live Browser         Telegram
     │               latest frame
     ▼
Activity Room
semantic events
```

Then send from Telegram:

```
"Click More information"
```

and prove the **same BR-001 session** changes on the desktop Live Browser, appears semantically in Activity Room, updates the Floating Assistant, and returns a new frame to Telegram.

This single proof validates: Telegram ingress, identity/workspace/conversation correlation, Global Assistant orchestration, browser execution authority, agent-browser isolation, snapshot artifacts, canonical events, Activity Room projection, Telegram delivery, and cross-surface continuity.

Only after stable: higher-frequency streaming, remote element interaction, browser profiles, uploads/downloads, recording, voice commands, and WebRTC-grade live control.

## Architecture Traceability

- VES-TG-001: Telegram Interaction Platform
- VES-LB-001 through VES-LB-030: Live Browser milestones
- @vestara/browser-types, browser-runtime, agent-browser-runtime, browser-projection
- agent-browser: https://agent-browser.dev/
