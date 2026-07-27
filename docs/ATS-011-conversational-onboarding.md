# ATS-011 — Conversational Onboarding

**Acceptance Test Specification**

| Field | Value |
|-------|-------|
| ID | ATS-011 |
| Capability | Conversational Onboarding (v4.0) |
| Status | Draft |

---

## Golden Scenario

### Prerequisites
- Vestara is installed
- No prior UserProfile exists (first boot)

### Scenario

1. User runs `vestara` (no arguments)
2. System boots and detects no UserProfile
3. System greets conversationally: "Hello! I'm Vestara, your AI engineering companion. What's your name?"
4. User responds: "Eddie"
5. System creates UserProfile with name="Eddie"
6. System asks: "What kind of work do you do?"
7. User responds: "Software engineer"
8. System enriches profile with role
9. System transitions to workspace mode
10. Returning user flow: system greets "Welcome back, Eddie!"

---

## Acceptance Tests

### Test 1: First Boot — Profile Creation

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Run `vestara` | System boots successfully |
| 2 | | System detects no UserProfile |
| 3 | | System sends conversational greeting asking for name |
| 4 | User says "My name is [name]" | System extracts name from response |
| 5 | | UserProfile created with name field |
| 6 | | Profile persisted to storage |
| 7 | | System confirms: "Nice to meet you, [name]!" |

### Test 2: Returning User — Profile Recognition

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Run `vestara` (second time) | System boots successfully |
| 2 | | System detects existing UserProfile |
| 3 | | System greets "Welcome back, [name]!" |
| 4 | | Profile load time < 100ms |

### Test 3: Profile Enrichment

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | User says "I'm a backend developer" | Profile.role = "backend developer" |
| 2 | User says "I use Go and Rust" | Profile.preferredStack = ["Go", "Rust"] |
| 3 | User says "I want to build a CLI tool" | Profile.goals includes "build a CLI tool" |

### Test 4: ConversationSession Creation

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Boot Vestara | ConversationSession created |
| 2 | Exchange 3 messages | Session.transcript has 3 pairs |
| 3 | Shutdown | Session.endedAt is set |
| 4 | Re-boot | Previous session is referenced |

### Test 5: `vestara doctor audio`

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Run `vestara doctor audio` | Audio diagnostics displayed |
| 2 | | Microphone check reported |
| 3 | | Speakers check reported |
| 4 | | VAD status reported |
| 5 | | STT status reported |
| 6 | | TTS status reported |
| 7 | | Latency metrics shown |
| 8 | | Overall healthy or degraded (never unhealthy unless fatal) |

### Test 6: Deterministic Fallback — No AI Provider

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Start without AI provider configured | System boots |
| 2 | | System sends greeting |
| 3 | User responds | System uses deterministic response template |
| 4 | Profile still created | UserProfile is saved |

### Test 7: ConversationSession Persistence

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Boot, exchange messages | Session.transcript populated |
| 2 | Shutdown | Session saved with endedAt |
| 3 | Re-boot | Session loaded from storage |
| 4 | Session has referenced artifacts | Artifact IDs stored in referencedArtifacts |

### Test 8: Profile-Enriched Conversations

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Profile has name="Eddie", role="developer" | |
| 2 | Send message "What should I work on?" | System uses profile context for response |
| 3 | Response references user's role and stack | Context-aware response |

---

## Performance Targets

| Test | Metric | Target |
|------|--------|--------|
| Profile load | Latency | < 100ms |
| Session load | Latency | < 100ms |
| Audio capture | Latency | < 10ms |
| VAD | Latency | < 20ms |
| STT | Latency | < 300ms |
| TTS | Latency | < 150ms |
| Conversation | Latency | < 700ms |
| End-to-end (audio) | Latency | < 1.5s |
