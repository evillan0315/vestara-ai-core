# ATS-012 — Conversation Platform Validation

**Status**: Draft
**Date**: 2026-07-25
**Traceability**: PCS-022, UX-012, v4.1

---

## 1. Test Environment

```
Runtime: Node 22+
Deps: @vestara/conversation-runtime, @vestara/conversation, @vestara/shared
Providers: OpenCodeCloudProvider, LocalProvider, OpenAICompatibleTestAdapter
Storage: SQLite (in-memory for tests)
```

---

## 2. Acceptance Tests

### AT-001: First Boot Greeting

**Scenario**: No UserProfile exists → engine returns first-boot greeting.

**Given**: A `DefaultConversationEngine` with an empty `UserProfileStore`
**When**: `getGreeting()` is called
**Then**: Returns `"Hello! I'm Vestara, your AI engineering companion. What's your name?"`

```typescript
const engine = createTestEngine({ profile: null });
const greeting = await engine.getGreeting();
assert.equal(greeting, "Hello! I'm Vestara, your AI engineering companion. What's your name?");
```

---

### AT-002: Returning User Recognition

**Scenario**: UserProfile exists → engine returns personalized greeting.

**Given**: A `DefaultConversationEngine` with a stored `UserProfile` (name: "Alice")
**When**: `getGreeting()` is called
**Then**: Returns `"Welcome back, Alice! You were working on your engineering workspace. Would you like to continue?"`

```typescript
const store = new InMemoryUserProfileStore();
await store.save({ id: 'p1', name: 'Alice', /* ... */ });
const engine = createTestEngine({ profileStore: store });
await engine.initialize();
const greeting = await engine.getGreeting();
assert.ok(greeting.includes('Alice'));
assert.ok(greeting.includes('Welcome back'));
```

---

### AT-003: Profile Enrichment from Message

**Scenario**: User sends message introducing themselves → profile is created with extracted fields.

**Given**: A `DefaultConversationEngine` with no existing profile
**When**: `startSession()` then `sendMessage("Hi, my name is Bob and I'm a TypeScript developer")`
**Then**: Profile is created with `name: "Bob"`, role containing "TypeScript", `preferredStack` containing "TypeScript"

```typescript
const engine = createTestEngine({ profile: null });
await engine.startSession('local');
await engine.sendMessage("Hi, my name is Bob and I'm a TypeScript developer");
const profile = await engine.getProfile();
assert.equal(profile?.name, 'Bob');
assert.ok(profile?.role?.toLowerCase().includes('typescript'));
assert.ok(profile?.preferredStack?.includes('TypeScript'));
```

---

### AT-004: Greeting Extraction Patterns

**Scenario**: Various name formats are correctly extracted.

| Input | Expected name |
|-------|--------------|
| `"my name is Alice"` | Alice |
| `"I'm Bob"` | Bob |
| `"call me Charlie"` | Charlie |
| `"name's Diana"` | Diana |
| `"Eve"` (single word) | Eve |
| `"a"` (too short) | null |
| `"abcdefghijklmnopqrstuvwxyz12345"` (too long) | null |

---

### AT-005: Provider Switching — Same Workflow

**Scenario**: The same conversation workflow works identically with different providers.

**Given**: A test workflow: startSession → sendMessage → getResponse
**When**: The workflow is run with `OpenCodeCloudProvider`
**And**: The workflow is run with `OpenAICompatibleTestAdapter`
**Then**: Both produce valid `(response, profile, session)` tuples
**And**: Neither throws an exception
**And**: The engine code (`DefaultConversationEngine`) is identical between runs

```typescript
const providers = [
  { name: 'opencode-cloud', provider: createOpenCodeProvider() },
  { name: 'openai-compat', provider: createOpenAIAdapter() },
];

for (const { name, provider } of providers) {
  const router = new ProviderRouter();
  router.registerOnline(provider);
  const engine = new DefaultConversationEngine({ conversationService, providerRouter: router, profileStore, sessionStore });
  await engine.initialize();
  await engine.startSession('test');
  const result = await engine.sendMessage('What is the architecture?');
  assert.ok(result.response, `${name}: expected response`);
  assert.ok(result.profile, `${name}: expected profile`);
  assert.ok(result.session, `${name}: expected session`);
}
```

---

### AT-006: Offline Degradation

**Scenario**: No provider available → engine returns deterministic stub without throwing.

**Given**: A `DefaultConversationEngine` with `LocalProvider` (unhealthy, no online provider)
**When**: A message is sent
**Then**: Response contains deterministic stub text
**And**: Engine status is `degraded`
**And**: No exception is thrown

```typescript
const localProvider = new LocalProvider();
// No online provider registered
const router = new ProviderRouter();
router.registerOffline(localProvider);
const engine = new DefaultConversationEngine({ conversationService, providerRouter: router, /* ... */ });
await engine.initialize();
await engine.startSession('test');
const result = await engine.sendMessage('Hello');
assert.ok(result.response.includes('deterministic stub'));
assert.equal(engine.status, 'degraded');
```

---

### AT-007: Session Persistence

**Scenario**: A conversation session survives engine restart.

**Given**: A started session with one message exchange
**When**: The session is saved to `ConversationSessionStore`
**And**: A new engine loads the session
**Then**: Transcript, context, and metadata are preserved

```typescript
const sessionStore = new InMemorySessionStore();
const engine1 = createTestEngine({ sessionStore });
await engine1.startSession('test');
const result1 = await engine1.sendMessage('Hello');
await engine1.endSession();

const loaded = await sessionStore.load(result1.session.id);
assert.ok(loaded);
assert.equal(loaded?.transcript.length, 2); // user + assistant
assert.ok(loaded?.context.lastExchange);
```

---

### AT-008: Provider Configuration-Driven

**Scenario**: Provider selection is controlled by configuration, not code.

**Given**: A `ProviderRouter` with both online and offline providers registered
**When**: `selectProvider('local')` is called
**Then**: `resolve()` returns the local provider
**When**: `selectProvider('opencode-cloud')` is called
**Then**: `resolve()` returns the online provider
**When**: `selectProvider(null)` (clear selection) with online healthy
**Then**: `resolve()` returns the online provider (default priority)

```typescript
const router = new ProviderRouter();
router.registerOnline(openCodeProvider);
router.registerOffline(localProvider);

router.selectProvider('local');
assert.equal((await router.resolve()).id, 'local');

router.selectProvider('opencode-cloud');
assert.equal((await router.resolve()).id, 'opencode-cloud');

router.clearSelection();
assert.equal((await router.resolve()).id, 'opencode-cloud');
```

---

### AT-009: Health Check Accuracy

**Scenario**: Provider health checks reflect actual provider state.

| Provider state | Router health |
|---------------|---------------|
| Online healthy, offline healthy | Active: online, failover: enabled |
| Online healthy, offline unhealthy | Active: online, failover: enabled |
| Online unhealthy, offline healthy | Active: offline, failover: enabled |
| Both unhealthy | Active: unhealthy, failover: disabled |
| No providers registered | Active: null, failover: disabled |

---

### AT-010: Conversation Benchmarks

**Scenario**: All conversation benchmarks meet targets.

| Benchmark | Target | Method |
|-----------|--------|--------|
| Provider resolve | < 50ms | `router.resolve()` |
| Profile load (SQLite) | < 20ms | `profileStore.load()` |
| Session save (SQLite) | < 20ms | `sessionStore.save()` |
| Health check (local) | < 100ms | `localProvider.health()` |
| E2E message (stub) | < 100ms | Full `sendMessage()` cycle |

---

### AT-011: OpenCode Provider Initialization

**Scenario**: OpenCode provider initializes successfully with default configuration.

**Given**: A `OpenCodeProvider` with no configuration
**Then**: `id` equals `'opencode'`, `name` equals `'OpenCode'`, `model` equals `'deepseek-v4-flash-free'`

```typescript
const provider = new OpenCodeProvider({});
assert.equal(provider.id, 'opencode');
assert.equal(provider.name, 'OpenCode');
assert.equal(provider.model, 'deepseek-v4-flash-free');
```

---

### AT-012: OpenCode Passes Common Contract

**Scenario**: OpenCode provider implements the `ConversationProvider` interface contract.

**Given**: An `OpenCodeProvider`
**Then**: `complete`, `stream`, `health`, `models` are all functions
**When**: `setModel('deepseek-v4-pro')` is called
**Then**: `model` equals `'deepseek-v4-pro'`

---

### AT-013: Runtime Switch Without Code Changes

**Scenario**: The conversation runtime switches between all four provider types with zero code changes.

**Given**: A `ProviderRouter` with `OpenCodeProvider`, `OllamaProvider`, `GeminiProvider`, and `OpenAICompatibleProvider` registered
**When**: `selectProvider` is called for each provider in sequence
**Then**: `resolve()` returns the correct provider each time
**And**: The `DefaultConversationEngine` code is identical between switches

```typescript
const providers = ['opencode', 'ollama', 'gemini', 'openai-compat'];
for (const kind of providers) {
  router.selectProvider(kind);
  const resolved = await router.resolve();
  assert.equal(resolved.id, kind);
}
```

---

### AT-014: Consistent Health Reporting

**Scenario**: Health reporting remains consistent across all provider types.

**Given**: An `OpenCodeProvider`, `OllamaProvider`, `GeminiProvider`, and `OpenAICompatibleProvider`
**When**: `ProviderFactory.healthCheckAll` is called
**Then**: Every provider returns `{ status, latency, message }`
**And**: No provider throws during health check

```typescript
const results = await ProviderFactory.healthCheckAll([opencode, ollama, gemini, openai]);
for (const [id, h] of Object.entries(results)) {
  assert.ok(['healthy', 'unhealthy'].includes(h.status));
  assert.typeOf(h.latency, 'number');
}
```

---

### AT-015: Streaming Consistency

**Scenario**: Streaming behaves consistently across all providers using the shared `StreamChunk` interface.

**Given**: All four providers
**When**: `stream()` is called on each with a simple prompt
**Then**: All yield `type: 'text'` chunks followed by `type: 'complete'`
**And**: No provider yields a chunk outside the `StreamChunk` type union

## 3. Performance Regression Tests

### RT-001: Provider Switch Latency

Switching providers should not introduce measurable overhead.

```typescript
const router = new ProviderRouter();
router.registerOnline(online);
router.registerOffline(offline);

const start = performance.now();
for (let i = 0; i < 100; i++) {
  router.selectProvider(i % 2 === 0 ? 'opencode-cloud' : 'local');
  await router.resolve();
}
const avg = (performance.now() - start) / 100;
assert.ok(avg < 5, `Provider switch avg latency: ${avg}ms (target: <5ms)`);
```

---

## 4. Security Tests

### ST-001: Provider Credential Isolation

Providers must not leak credentials through the ConversationProvider interface.

- Provider adapters must not expose API keys or tokens in health check output
- Provider configuration (base URLs, API keys) is not exposed via `getStatus()`
- The engine has no access to provider credentials

---

## 5. Test Configuration

```
Provider router      → registered with online + offline providers
ConversationService  → in-memory conversation store
UserProfileStore     → SQLite :memory:
ConversationSessionStore → SQLite :memory:
EventBus             → in-memory event bus
Logger              → silent mock
```
