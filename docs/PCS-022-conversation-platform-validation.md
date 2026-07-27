# PCS-022 — Conversation Platform Validation

**Status**: Draft
**Date**: 2026-07-25
**Depends on**: PCS-020 (Conversational Onboarding)
**Traceability**: v4.1 milestone

---

## 1. Problem Statement

Before production, prove the conversation stack is truly provider-independent. The architecture claims providers are replaceable implementations — not foundational dependencies. This specification defines the validation criteria and tests required to prove that claim.

**Primary question**: Can the same onboarding workflow work with any provider without architectural changes?

---

## 2. Validation Criteria

Five criteria must hold for the milestone to be complete:

| # | Criterion | Evidence required |
|---|-----------|-------------------|
| 1 | Same onboarding workflow works with OpenCode Cloud | Integration test passes with `OpenCodeCloudProvider` |
| 2 | Same onboarding workflow works with an alternative provider (OpenAI-compatible) | Integration test passes with `OpenAICompatibleProvider` (test adapter) |
| 3 | Same onboarding workflow works fully offline | Integration test passes with `LocalProvider` in offline mode |
| 4 | No changes to `ConversationEngine`, `UserProfile`, or `ConversationSession` when switching providers | Same test file, same assertions, different provider registration |
| 5 | Provider selection is configuration-driven | Provider chosen via `PreferenceService`, not hardcoded |

---

## 3. Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | First boot greets user conversationally with welcome prompt | `getGreeting()` returns `WELCOME_FIRST_BOOT` when no profile exists |
| 2 | UserProfile is created and enriched after first conversation | `_enrichProfile()` extracts name, role, stack, goals from user messages |
| 3 | Returning user is recognized by name with resume capability | `getGreeting()` returns `WELCOME_RETURNING(name)` when profile exists |
| 4 | `vestara doctor audio` reports all audio services with latency | CLI outputs mic, speaker, VAD status with latency measurements |
| 5 | All conversation benchmarks meet targets | `benchmark conversation` exits within thresholds |
| 6 | Offline mode provides identical flow (quality may differ) | Same conversation steps succeed with `LocalProvider` |
| 7 | ConversationSession persists and references workspace artifacts | Session survives engine restart; referencedArtifacts populated |

---

## 4. Provider Independence Architecture

### Provider Interface

Every conversation provider implements the `ConversationProvider` interface:

```typescript
interface ConversationProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  readonly model: string;

  complete(request: ConversationRequest): Promise<ConversationResponse>;
  stream(request: ConversationRequest): AsyncIterable<StreamChunk>;
  health(): Promise<ProviderHealth>;
  models(): Promise<ModelInfo[]>;
  setModel?(model: string): void;
}
```

### Route Resolution (deterministic priority)

```
1. User-selected provider (PreferenceService)
2. OpenCode Cloud (online, if available and reachable)
3. Local provider (Ollama/vLLM, if detected)
4. Fallback stub (never crash, degrade gracefully)
```

### Provider lifecycle

| Stage | Provider | Purpose |
|-------|----------|---------|
| Development & testing | OpenCode Cloud | Rapid UX validation, low latency |
| Provider-independence validation | OpenAI-compatible adapter | Prove abstraction holds |
| Offline validation | Local provider stub | Test degraded flow |
| Production | Any provider | Configured per workspace |

---

## 5. Test Scenarios

### Scenario A — First Boot Greeting

1. Initialize `ConversationEngine` with `UserProfileStore` that returns `null`
2. Call `getGreeting()`
3. Assert: returns `"Hello! I'm Vestara, your AI engineering companion. What's your name?"`

### Scenario B — Returning User Recognition

1. Save a `UserProfile` with name "Alice" to the store
2. Re-initialize `ConversationEngine` (loads existing profile)
3. Call `getGreeting()`
4. Assert: returns `"Welcome back, Alice! You were working on your engineering workspace. Would you like to continue?"`

### Scenario C — Profile Enrichment

1. Start a session with no profile
2. Send message: "Hi, my name is Bob and I'm a TypeScript developer"
3. Assert: profile created with name "Bob", role containing "TypeScript developer", preferredStack containing "TypeScript"

### Scenario D — Provider Switching

1. Create `ConversationEngine` with `OpenCodeCloudProvider`
2. Run onboarding workflow (start session, send message, get response)
3. Re-create engine with `LocalProvider` (or test adapter)
4. Run same onboarding workflow with same assertions
5. Assert: both produce valid `(response, profile, session)` tuples

### Scenario E — Offline Degradation

1. Create `ConversationEngine` with `LocalProvider` set to unhealthy
2. Run onboarding workflow
3. Assert: returns deterministic stub response, not an exception
4. Assert: engine status is `degraded`

### Scenario F — Session Persistence

1. Start a session, send a message
2. Save session to `ConversationSessionStore`
3. Create a new engine, load the session
4. Assert: session transcript, context, and metadata are preserved

### Scenario G — Provider Configuration

1. Set provider preference via `PreferenceService` to `"opencode-cloud"`
2. Assert: `ProviderRouter.resolve()` returns `OpenCodeCloudProvider`
3. Change preference to `"local"`
4. Assert: `ProviderRouter.resolve()` returns `LocalProvider`

### Scenario H — OpenCode as First-Class Provider

1. Create `OpenCodeProvider` via `ProviderFactory.create({ kind: 'opencode' })`
2. Assert: provider id is `'opencode'`, name is `'OpenCode'`
3. Register with `ProviderRouter`
4. Run same onboarding workflow as scenarios A–G
5. Assert: no behavioral changes to `ConversationEngine`

### Scenario I — Multi-Provider Health Comparison

1. Create `OpenCodeProvider`, `OllamaProvider`, `GeminiProvider`, `OpenAICompatibleProvider`
2. Call `ProviderFactory.healthCheckAll()` with all four
3. Assert: each returns a valid `ProviderHealth` with `status`, `latency`, `message`
4. Assert: health check never throws regardless of provider availability

---

## 5b. Supported Provider Matrix

| Provider          | Streaming | Health | Model Discovery | Local | Remote |
|-------------------|:---------:|:------:|:---------------:|:-----:|:------:|
| Ollama            | ✅ | ✅ | ✅ | ✅ | Optional |
| Gemini            | ✅ | ✅ | ✅ | ❌ | ✅ |
| OpenAI-Compatible | ✅ | ✅ | ✅ | Depends | ✅ |
| **OpenCode**      | ✅ | ✅ | ✅ | Depends | ✅ |

---

## 6. Conversation Benchmarks

| Benchmark | Target | Measurement |
|-----------|--------|-------------|
| Provider resolve time | < 50ms | Time from `resolve()` call to provider returned |
| Profile load time | < 20ms | Time to load profile from SQLite store |
| Session save time | < 20ms | Time to persist session to SQLite store |
| Health check (online) | < 2000ms | Time for provider health check |
| Health check (offline) | < 100ms | Time for local health check |
| End-to-end message (no AI) | < 100ms | Full sendMessage cycle with stub provider |

---

## 7. Acceptance Gates

1. All 7 test scenarios pass with all 3 provider types (open-code, openai-compatible, local)
2. All conversation benchmarks meet targets
3. Provider can be switched via configuration with zero code changes
4. Offline fallback never throws — always returns degraded but functional
5. `pnpm test` passes (existing + new tests)
6. `pnpm vestara doctor conversation` reports healthy
7. All provider-specific code is behind the `ConversationProvider` interface — no leaking into engine

---

## 8. Non-Goals

- Implementing full OpenAI API compatibility — test adapter only needs to prove the interface works
- Realtime voice (STT/TTS) — that is validated by separate audio pipeline tests
- Performance optimization — benchmarks are checkpoints, not optimization targets
- Production-grade resilience — covered by v5.x Operational Era

---

## 9. Evolution

After v4.1 validation passes, providers are proven as replaceable implementations. Future providers should follow the same pattern without engine changes. Provider-specific features (e.g. streaming format differences) must be normalized by the adapter, not the engine.
