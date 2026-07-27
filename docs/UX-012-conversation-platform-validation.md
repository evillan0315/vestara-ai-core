# UX-012 — Conversation Platform Validation

**Status**: Draft
**Date**: 2026-07-25
**Traceability**: PCS-022, v4.1

---

## 1. User Interaction Flow

### 1.1 First Boot (no profile)

```
Terminal:
  $ vestara

  ╭──────────────────────────────────────────────╮
  │                                              │
  │   🤖 Vestara AI Engineering Companion        │
  │                                              │
  │   Hello! I'm Vestara, your AI engineering    │
  │   companion. What's your name?               │
  │                                              │
  │   > _                                         │
  │                                              │
  ╰──────────────────────────────────────────────╯
```

### 1.2 Returning User (existing profile)

```
Terminal:
  $ vestara

  ╭──────────────────────────────────────────────╮
  │                                              │
  │   Welcome back, Alex!                        │
  │                                              │
  │   You were working on vestara-ai-core.       │
  │   Would you like to continue? (Y/n)          │
  │                                              │
  ╰──────────────────────────────────────────────╯
```

### 1.3 Provider Selection

```
Workspace REPL:
  my-repo > config set provider opencode-cloud
  ✓ Provider set to: opencode-cloud

  my-repo > config set provider local
  ✓ Provider set to: local

  my-repo > config set provider openai
  ✓ Provider set to: openai
```

### 1.4 Provider Status

```
  $ vestara doctor conversation

  ╭──────────────────────────────────────────────╮
  │   Conversation Health                        │
  ├──────────────────────────────────────────────┤
  │   Provider Router: healthy (12ms)            │
  │   Active Provider: opencode-cloud            │
  │   Online: opencode-cloud (connected, 4ms)    │
  │   Offline: local (unhealthy, 2ms)            │
  │   Failover: enabled                          │
  │   Engine Status: ready                       │
  │   Profile: Alex (returning)                  │
  │                                              │
  │   Audio: microphone ✗, speakers ✗, VAD ✗    │
  │   STT: unavailable                           │
  │   TTS: unavailable                           │
  ╰──────────────────────────────────────────────╯
```

---

## 2. Diagnostics Output

### 2.1 `vestara doctor conversation` — health report

| Field | Description |
|-------|-------------|
| Provider Router | healthy/degraded with latency |
| Active Provider | Currently resolved provider ID |
| Online | OpenCode Cloud connection status + latency |
| Offline | Local LLM detection status + latency |
| Failover | Whether online→offline failover is possible |
| Engine Status | ready/degraded/unavailable |
| Profile | User name + first-boot/returning status |

### 2.2 `vestara benchmark conversation` — timing report

```
  Provider Resolve:     12ms  (target: <50ms)  ✅
  Profile Load:          3ms  (target: <20ms)  ✅
  Session Save:          2ms  (target: <20ms)  ✅
  Health Check Online: 356ms  (target: <2s)    ✅
  Health Check Offline:  4ms  (target: <100ms) ✅
  E2E Message (stub):   18ms  (target: <100ms) ✅

  All benchmarks meet targets.
```

---

## 3. Error & Degradation UX

### 3.1 Provider unavailable (first boot, no network)

```
  $ vestara open .

  ╭──────────────────────────────────────────────╮
  │   ⚠ Provider not available                   │
  │                                              │
  │   No AI provider is available. Vestara will  │
  │   operate in offline mode with limited       │
  │   capabilities.                              │
  │                                              │
  │   • Workspace analysis: full functionality   │
  │   • AI explanations: unavailable             │
  │   • AI planning: unavailable                 │
  │   • Deterministic tiers: fully functional    │
  │                                              │
  │   Install Ollama (ollama.ai) for offline AI. │
  ╰──────────────────────────────────────────────╯
```

### 3.2 Provider switch fails gracefully

```
  my-repo > config set provider openai
  ✓ Provider set to: openai

  (Next provider health check fails)

  my-repo > vestara doctor conversation
  │   Active Provider: openai (fallback to opencode-cloud)
  │   Router Status: degraded
  │   Reason: OpenAI provider unreachable, using fallback
```

---

## 4. Conversation Flow States

| State | Trigger | UX |
|-------|---------|-----|
| First boot | No UserProfile exists | Welcome message with name prompt |
| Returning | UserProfile exists | Personalized greeting with workspace context |
| Provider degraded | resolve() returns unavailable | Warning banner + deterministic fallback |
| Session expired | Session not found on load | New session created, profile preserved |
| Offline | No provider available | Degraded banner, deterministic responses |
| Provider switched | config set provider | Transparent — next message uses new provider |
