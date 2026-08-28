# PCS-020 — Conversational Onboarding

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-020 |
| Name | Conversational Onboarding |
| Command | `vestara` (boot), `vestara doctor audio` |
| Version | 1.0 |
| Status | Draft |
| Epic | EPIC-020 |

---

## Goal

A first-time user boots Vestara and immediately begins talking. No keyboard, terminal, or setup wizard required — just a conversational greeting that welcomes the user, establishes identity, and transitions naturally into the engineering workspace.

**Primary question**: Can a first-time user go from power-on to productive conversation without typing a single command?

---

## Core Invariant

```
The person, not the repository, is the first object in Vestara AI OS.
```

---

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| (none) | — | — | Boot sequence starts conversationally |

---

## Outputs

| Artifact | Description |
|----------|-------------|
| `UserProfile` | Conversational identity (name, role, experience, preferred stack, communication style, goals, memory, permissions) |
| `ConversationSession` | First-class artifact linking transcript to workspace artifact graph |
| `ConversationEngine` | Wraps ConversationService with profile enrichment |

---

## User Flow

```
Boot
    ↓
Conversation — "Hello, welcome to Vestara. What would you like to build today?"
    ↓
User speaks → STT → Conversation Engine → enrich UserProfile → Workspace
    ↓
Response → TTS → Speaker
```

### Startup sequence (inverted — person before repository):

```
Boot → Conversation → UserProfile → Workspace → Repository
```

---

## Architecture

### ConversationEngine

The `ConversationEngine` wraps the existing `ConversationService` with:

1. **Profile enrichment** — Each exchange extracts identity information and updates `UserProfile`
2. **ConversationSession management** — Creates and persists sessions with artifact references
3. **Audio pipeline integration** — Routes through VAD/STT/TTS when available
4. **Welcome flow** — First-boot greeting, returning-user recognition
5. **Offline-first** — All tiers work without internet (quality degrades, flow does not)

```
ConversationEngine
  ├── ConversationService (existing)  — Core message send/receive/stream
  ├── UserProfileStore               — Persisted identity
  ├── ConversationSessionStore        — Persisted session artifacts
  └── AudioPipeline (optional)        — VAD → STT → LLM → TTS
```

### Audio Pipeline (provider-agnostic)

```
Microphone → VAD → STT → ConversationEngine → TTS → Speaker
```

| Function | Online | Offline |
|----------|--------|--------|
| VAD | Cloud or local | Silero VAD |
| STT | Cloud API | Whisper.cpp / faster-whisper |
| TTS | Cloud API | Piper |

### UserProfile

```typescript
interface UserProfile {
  id: string;
  name?: string;
  role?: string;
  experience?: string;
  preferredStack?: string[];
  communicationStyle?: 'concise' | 'detailed' | 'balanced';
  goals?: string[];
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
  lastSessionId?: string;
}
```

### ConversationSession

```typescript
interface ConversationSession {
  id: string;
  userId: string;
  profileId: string;
  startedAt: string;
  endedAt?: string;
  transcript: Message[];
  audioTimeline: AudioTimelineEntry[];
  context: Record<string, unknown>;
  referencedArtifacts: string[];
  summaries: string[];
  actions: string[];
  memoryUpdates: string[];
}
```

---

## Offline-First Principle

Offline is not a degraded mode. The same workflow runs whether the user has internet or not:

| Function | Online | Offline |
|----------|--------|--------|
| Voice Activity Detection | Cloud or local | Silero VAD |
| Speech-to-Text | Cloud API | Whisper.cpp / faster-whisper |
| Conversation | Remote LLM | Local via existing provider abstraction |
| Text-to-Speech | Cloud API | Piper |

The quality of responses may differ, but capabilities and user flow remain identical.

---

## 4 OS Services

| Service ID | Role |
|------------|------|
| `vestara-audio` | Audio capture and VAD |
| `vestara-stt` | Speech-to-text (Whisper/faster-whisper) |
| `vestara-conversation` | Conversation engine with profile enrichment |
| `vestara-tts` | Text-to-speech (Piper) |

---

## Diagnostic Command

```
vestara doctor audio

Audio
  ✓ Microphone
  ✓ Speakers
  ✓ VAD
  ✓ Whisper.cpp
  ✓ Piper
  ✓ Conversation
  ✓ Memory

Latency
  STT              148 ms
  LLM              392 ms
  TTS               97 ms
  Total            637 ms
```

---

## Benchmarks

| Stage | Target |
|-------|--------|
| Audio capture | < 10 ms |
| VAD | < 20 ms |
| STT | < 300 ms |
| Conversation | < 700 ms (local model dependent) |
| TTS | < 150 ms |
| End-to-end | < 1.5 s |

---

## Golden Demo

```
Power on → "Hello" → Vestara replies → "My name is Eddie"
  → Profile created → "Open Vestara" → Workspace opens
  → "Explain the architecture" → RepositoryWorkspace answers
  → "Create a plan to add OAuth" → Plan created
  → "Predict the impact" → Prediction produced
  → "Implement it" → Implementation begins
```

No keyboard. No terminal. No internet required.

---

## Provider Architecture

The Conversation Engine never knows which provider it is using. All provider selection is handled by the `ProviderRouter`:

```
Conversation Engine
        │
        ▼
ConversationProvider (abstract interface)
        │
 ┌──────┴──────────────┐
 ▼                     ▼
OpenCode Cloud     Local Provider
(Development)      (Ollama / vLLM)
        │
        ▼
OpenAI Realtime API
(Production target)
```

### Provider Lifecycle

| Stage | Provider | Goal |
|-------|----------|------|
| Development | OpenCode Cloud | Rapid UX validation, prompt iteration |
| Pre-Production | OpenCode + Local | Verify abstraction, offline fallback, latency |
| Production | OpenAI Realtime API | Low-latency bidirectional voice conversations |
| Offline Production | Local STT + Local LLM + Local TTS | Full functionality without internet |

### Intent-Based Model Routing

The `ProviderRouter` selects models by conversation intent, not by a single fixed model:

| Intent | Model | Rationale |
|--------|-------|-----------|
| greeting / onboarding | DeepSeek V4 Flash | Fast, low-cost, responsive |
| casual conversation | DeepSeek V4 Flash | Low latency, good conversational quality |
| repository explanation | Qwen3.7 Max | Strong reasoning, large context, stable multi-turn |
| planning | DeepSeek V4 Pro | Engineering reasoning, architecture discussions |
| implementation | DeepSeek V4 Pro | Code generation, engineering analysis |
| architecture discussions | Qwen3.7 Max | Reasoning + large context handling |
| long-context analysis | GLM-5.2 | Huge context window for large repos |

### Provider Priority

1. User explicitly selected a provider/model
2. OpenCode Cloud is available and reachable
3. Local provider (Ollama / vLLM)
4. If neither available, keep running with degraded status — never crash

### Fallback Behavior

```
Online (OpenCode Go)           Offline
─────────────────────────      ─────────────────
Conversation    → Flash        Conversation    → Local model
Explain         → Qwen Max     Planning        → Local model
Plan            → V4 Pro       Implementation  → Local model
Implement       → V4 Pro
Architecture    → Qwen Max
Large Context   → GLM-5.2
```

Switching the provider (OpenCode → OpenAI → Local) requires zero changes to `ConversationEngine`, `UserProfile`, or `ConversationSession`.

---

## Real-Time Activity Stream

After conversational onboarding is operational, every significant user, agent, and system action emits a structured domain event:

### Event Envelope

```typescript
interface WorkspaceEvent {
  id: string;
  timestamp: string;
  category: 'conversation' | 'workspace' | 'planning' | 'implementation'
           | 'verification' | 'collaboration' | 'system' | 'agent' | 'memory' | 'profile';
  type: string;           // e.g. 'conversation.response.completed'
  actor: { id: string; name: string; type: 'user' | 'agent' | 'system' };
  resource: { type: string; id: string; name: string };
  message: string;         // Human-readable summary
  metadata: Record<string, unknown>;
}
```

### Domain Events (by category)

| Category | Events |
|----------|--------|
| conversation | `started`, `listening`, `transcribed`, `intent.detected`, `response.started`, `response.completed`, `speaking`, `finished` |
| workspace | `opened`, `indexed`, `updated` |
| planning | `created`, `approved`, `completed`, `cancelled` |
| implementation | `created`, `applied` |
| verification | `started`, `completed` |
| collaboration | `submitted`, `approved`, `rejected` |
| agent | `started`, `completed` |
| memory | `indexed`, `queried` |
| profile | `created`, `updated` |

### Activity Persistence

Events are durably stored in an `ActivityLog` (SQLite-backed) under `.vestara/activity.db`. The dashboard can replay history after reconnects. The SSE server streams from the ActivityLog.

### Dashboard Timeline

The Activity panel renders a structured timeline:

```
10:32:01  ◉ Eddie
         Started conversation "Let's build OAuth login"

10:32:07  ● Vestara
         Created Plan #42

10:32:25  ◉ Eddie
         Approved Plan #42

10:32:31  ● Implementation Agent
         Started Change Set #15

10:33:08  ✔ Verification
         117 tests passed
```

Every event carries the initiating actor (`user`, `agent`, or `system`) and references the affected artifact. `system.heartbeat` remains an infrastructure health signal but is **not** the primary activity shown in the dashboard.

---

## v4.1 — Conversation Platform Validation

Before production, validate that the conversation stack is truly provider-independent:

1. Same onboarding workflow works with OpenCode
2. Same onboarding workflow works with OpenAI
3. Same onboarding workflow works fully offline
4. No changes to `ConversationEngine`, `UserProfile`, or `ConversationSession` when switching providers
5. Provider selection is configuration-driven

If all five hold, providers are proven as replaceable implementations — not foundational dependencies.

---

## Success Criteria

1. First boot greets user conversationally without CLI input
2. UserProfile is created and enriched after first conversation
3. Returning user is recognized by name with resume capability
4. `vestara doctor audio` reports all audio services with latency
5. All conversation benchmarks meet targets
6. Offline mode provides identical flow (quality may differ)
7. ConversationSession persists and references workspace artifacts

---

## See Also

- **Authority Event Catalog** — The canonical domain event catalog (emitting authority, bus type, payload, consumers) is maintained in [`docs/AR-P1.5-AUTHORITY-CONTRACTS.md` Appendix A](AR-P1.5-AUTHORITY-CONTRACTS.md#appendix-a--event-catalog-canonical-version-ar-p151). That catalog is the authoritative source for workspace-wide event semantics; the events listed above in this document are onboarding-specific subsets.
