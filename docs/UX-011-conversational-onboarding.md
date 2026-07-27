# UX-011 — Conversational Onboarding

**User Experience Specification**

| Field | Value |
|-------|-------|
| ID | UX-011 |
| Capability | Conversational Onboarding (v4.0) |
| Status | Draft |

---

## First Boot

```
$ vestara

  Vestara Runtime v0.4
  ─────────────────────────────────────

  ✓ Initializing Kernel...
  ✓ Starting Conversation Engine...
  ✓ Checking for User Profile...

  Hello! I'm Vestara, your AI engineering companion.
  What's your name?

> Eddie

  Nice to meet you, Eddie! What kind of work do you do?

> I'm a software engineer working on TypeScript projects.

  Great! I've created your profile. Let me open your workspace...

  ✓ Profile created for Eddie
  ✓ Ready to help
```

### Key behaviors:
- No welcome wizard UI — purely conversational
- Profile questions asked only on first boot
- Each answer enriches the UserProfile
- After profile creation, transitions to workspace setup

---

## Returning User

```
$ vestara

  Vestara Runtime v0.4
  ─────────────────────────────────────

  ✓ Initializing Kernel...
  ✓ Loading User Profile...
  ✓ Profile loaded

  Welcome back, Eddie! It's been 3 hours.
  You were working on the authentication module.

  Would you like to continue where you left off?
```

### Key behaviors:
- Greets by name
- References last session context
- Offers to resume previous work
- No login or project selection step

---

## Voice Interaction (with audio pipeline)

```
$ vestara
  [Microphone activates automatically]
  Vestara: "Hello! I'm Vestara. What's your name?"
  [User speaks: "My name is Eddie"]
  Vestara: "Nice to meet you, Eddie!"
```

### Audio pipeline indicator (in `vestara doctor audio`):
```
Audio
  ✓ Microphone       [device: Built-in Microphone]
  ✓ Speakers         [device: Built-in Output]
  ✓ VAD              [silero]
  ✓ STT              [whisper.cpp]
  ✓ TTS              [piper]
  ✓ Conversation     [opencode]
```

---

## Text Fallback

When audio pipeline is unavailable, the conversation falls back to stdin/stdout:

```
$ vestara
  Hello! I'm Vestara, your AI engineering companion.
  (Audio pipeline unavailable — using text mode)

  What's your name?

>
```

---

## `vestara doctor audio` Command

```
$ vestara doctor audio

  Audio Diagnostics
  ─────────────────────────────────────

  Audio
    ✓ Microphone       Ready            12ms
    ✓ Speakers         Ready            8ms
    ✓ VAD              Available        5ms
    ✓ STT              Available        148ms
    ✓ TTS              Available        97ms
    ✓ Conversation     Healthy          392ms
    ✓ Memory           Connected        3ms

  Latency Summary
    STT              148 ms
    LLM              392 ms
    TTS               97 ms
    Total            637 ms

  Devices
    Microphone:      Built-in Microphone (ALSA)
    Speakers:        Built-in Output (ALSA)
```

---

## Error States

### Audio device not found:
```
  ✗ Microphone       Not Found
  ✗ Speakers         Not Found
    → Install PortAudio or ALSA utils for audio support
```

### STT provider unavailable:
```
  ✓ STT              Unavailable
    → Install whisper.cpp or set STT provider in config
    → Falling back to text input
```

### No AI provider:
```
  ✓ Conversation     Unhealthy
    → No AI provider configured
    → Running in offline deterministic mode
    → Basic responses only
```

---

## ConversationBenchmark Command

```
$ vestara benchmark conversation

  Conversation Benchmarks
  ─────────────────────────────────────

  Iteration 1/5:
    Audio capture      8ms
    VAD                5ms
    STT                142ms
    LLM                387ms
    TTS                95ms
    Total              637ms

  Iteration 2/5:
    Audio capture      7ms
    ...

  Results (avg of 5):
    Stage              Avg      Min      Max    Target
    Audio capture      7ms      5ms     12ms    < 10ms  ✓
    VAD                5ms      3ms      8ms    < 20ms  ✓
    STT                145ms   132ms    168ms   < 300ms ✓
    LLM                390ms   375ms    412ms   < 700ms ✓
    TTS                96ms    88ms     105ms   < 150ms ✓
    End-to-end         643ms   618ms    678ms   < 1.5s  ✓
```
