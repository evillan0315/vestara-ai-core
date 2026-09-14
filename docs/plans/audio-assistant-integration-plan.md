---
title: Audio Assistant Integration — Implementation Plan
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-14
next-review: 2026-10-14
---

# Audio Assistant Integration — Implementation Plan

## Overview

Integrate microphone input and spoken assistant output into the Global Assistant while preserving the existing text/SSE execution path. Audio must be an optional transport: when a device, provider, or permission is unavailable, the assistant remains usable in text-only mode.

The target loop is:

```text
Microphone → VAD → STT → Assistant turn → TTS → Speaker
```

Existing building blocks include `@vestara/audio`, `@vestara/stt`, `@vestara/tts`, and `@vestara/voice-browser`. The assistant execution boundary is currently owned by the API OpenCode adapter, so audio orchestration should wrap that boundary rather than duplicate assistant execution logic.

## Current state and gaps

| Area | Existing capability | Gap to close |
|------|---------------------|-------------|
| Audio | `VestaraAudioService` has microphone, VAD, speaker, device, and lifecycle abstractions | Concrete capture/playback providers still contain detection or loopback stubs |
| STT | `VestaraSTTService` and Whisper provider abstraction exist | Assistant-facing streaming/final-transcript contract must be fixed |
| TTS | `VestaraTTSService` supports single-shot and streaming calls; Piper provider detects installation | Piper synthesis currently returns empty buffers; no production cloud fallback |
| Voice orchestration | `DefaultVoiceAgentPipeline` already models listen → think → speak | It accepts an injected handler but is not yet the canonical Global Assistant transport |
| Assistant runtime | API OpenCode adapter streams assistant execution events | Audio input/output events and cancellation need an explicit API contract |
| UI | Assistant can remain text-based | Add permission, device, recording, speaking, and fallback states without coupling UI to providers |

## Goals

- Add push-to-talk and optional hands-free voice interaction.
- Stream partial/final transcripts and assistant text independently.
- Start TTS as soon as an assistant response segment is speakable.
- Allow interruption: new speech or explicit stop cancels playback and active synthesis.
- Preserve assistant capability policy, execution binding, audit, and provenance.
- Degrade cleanly to text input/output and report the reason.
- Support offline-capable local providers where available (Whisper/faster-whisper and Piper).

## Non-goals

- Replacing the OpenCode assistant execution protocol.
- Making speaker loopback capture part of the default assistant conversation.
- Adding a provider catalog or credentials UI in this slice.
- Treating provider availability as proof that a provider/model was used for execution.

## Milestones

### M1: Audio transport contract

**Target:** Define one assistant-owned contract for voice turns and lifecycle events.

| Task | Description | Verification |
|------|-------------|--------------|
| M1.1 | Define audio session states: `idle`, `requesting_permission`, `listening`, `transcribing`, `thinking`, `speaking`, `interrupted`, `error` | Contract tests cover every transition |
| M1.2 | Define events for permission, device, partial transcript, final transcript, assistant text segment, playback start/stop, interruption, and fallback | Event schema validation |
| M1.3 | Define request metadata: language, voice, speed, sample rate, session/conversation ID, and correlation ID | Serialization test |
| M1.4 | Define cancellation semantics and deadlines for capture, STT, assistant execution, TTS, and playback | Cancellation tests |

**Exit criteria:** The browser/client and API can share a versioned voice-session contract without exposing provider internals.

### M2: Runtime composition and provider selection

**Target:** Compose audio, STT, TTS, and assistant execution with explicit lifecycle ownership.

| Task | Description | Verification |
|------|-------------|--------------|
| M2.1 | Create an assistant audio session coordinator that owns one turn at a time | Unit tests for serialized turns |
| M2.2 | Inject `VestaraAudioService`, `VestaraSTTService`, and `VestaraTTSService`; do not instantiate hidden duplicates in route handlers | Composition test |
| M2.3 | Resolve configured/effective providers through the existing runtime boundary; keep selected provider/model provenance separate from catalog availability | Provenance test |
| M2.4 | Add bounded health checks and capability reporting for microphone, VAD, STT, TTS, and speaker | Degraded-environment tests |
| M2.5 | Ensure stop/dispose releases capture, synthesis, playback, and timers | Lifecycle/leak test |

**Exit criteria:** A session can start, stop, and report partial availability without destabilizing text assistant execution.

### M3: Input path — microphone to assistant

**Target:** Deliver final user speech to the existing assistant turn executor.

| Task | Description | Verification |
|------|-------------|--------------|
| M3.1 | Implement real microphone providers for supported desktop/browser targets behind the existing interface | Provider contract tests |
| M3.2 | Feed audio chunks through VAD and segment utterances; enforce maximum utterance duration and silence timeout | Deterministic chunk tests |
| M3.3 | Transcribe final utterances and emit partial/final transcript events | STT integration test with fake provider |
| M3.4 | Submit the final transcript through the existing Assistant/OpenCode adapter with the same session, capability policy, and execution binding | End-to-end contract test |
| M3.5 | Prevent duplicate submissions from repeated finalization or reconnects | Idempotency test |

**Exit criteria:** A spoken utterance creates exactly one normal assistant turn, with visible transcript evidence.

### M4: Output path — assistant to speaker

**Target:** Speak assistant responses without blocking text delivery.

| Task | Description | Verification |
|------|-------------|--------------|
| M4.1 | Implement actual Piper synthesis, including model/voice configuration, WAV/PCM validation, and process cleanup | Provider tests with a fake executable |
| M4.2 | Add a provider adapter seam for cloud TTS fallback without hardcoding credentials or provider selection | Adapter contract test |
| M4.3 | Segment assistant text at safe speech boundaries and start streaming TTS incrementally | Streaming integration test |
| M4.4 | Route synthesized audio to `SpeakerProvider.playStream()` and expose playback state | Playback test |
| M4.5 | Interrupt and drain safely when the user starts speaking, Stop is pressed, or the assistant turn ends | Interruption tests |

**Exit criteria:** Assistant text remains available immediately, and valid response segments produce audible output when TTS and speakers are available.

### M5: API and client integration

**Target:** Expose the voice session through the existing assistant transport.

| Task | Description | Verification |
|------|-------------|--------------|
| M5.1 | Add authenticated API endpoints/events for session start, audio upload/stream, stop, and capability status | API route tests |
| M5.2 | Preserve SSE/OpenCode execution events and correlate them with voice-session events | Correlation test |
| M5.3 | Add client controls for microphone permission, push-to-talk, mute, stop speaking, device selection, and text fallback | Component tests |
| M5.4 | Render partial/final transcripts and assistant text while audio is processing | Browser integration test |
| M5.5 | Make reconnect behavior explicit: recover display state, never silently resume microphone capture or playback | Reconnect test |

**Exit criteria:** The Global Assistant supports a complete voice turn and remains fully usable when audio is disabled.

### M6: Verification, observability, and rollout

**Target:** Prove reliability and ship safely.

| Task | Description | Verification |
|------|-------------|--------------|
| M6.1 | Add metrics for permission failures, provider health, STT latency, first-audio latency, total turn latency, interruptions, and fallback rate | Telemetry assertions |
| M6.2 | Add structured audit records without storing raw audio by default | Privacy test |
| M6.3 | Add tests for missing devices, unavailable Piper/Whisper, malformed audio, long utterances, provider timeout, cancellation, and API disconnect | Failure matrix passes |
| M6.4 | Run desktop/browser smoke tests with real providers where installed and fake providers in CI | CI and smoke reports |
| M6.5 | Gate rollout behind an audio capability flag; default to text-only until health checks pass | Feature-flag tests |

**Exit criteria:** The feature is observable, cancellable, privacy-safe, and reversible.

## Key decisions

1. **Text remains the source of truth for assistant execution.** STT produces the user message; TTS consumes assistant text. Raw audio is not sent to OpenCode.
2. **Audio is optional.** Provider failure must produce a user-visible fallback event, not a failed assistant turn.
3. **Only one active voice turn per conversation.** New input interrupts playback and cancels superseded work.
4. **No implicit microphone activation.** Permission and capture begin only after an explicit user action or an independently governed onboarding flow.
5. **Provider provenance is explicit.** Record configured/requested provider and observed health separately; claim actual execution use only when the runtime proves it.
6. **Raw audio retention is off by default.** Store transcripts and timing metadata only unless a user-enabled diagnostic mode requires audio samples.

## Dependencies

| Dependency | Reason |
|------------|--------|
| `@vestara/audio` | Capture, VAD, speaker, device, and lifecycle abstractions |
| `@vestara/stt` | Speech-to-text service and local/cloud provider seam |
| `@vestara/tts` | Synthesis service and provider seam |
| `@vestara/voice-browser` | Existing voice pipeline patterns and callback model |
| API OpenCode adapter | Canonical assistant turn execution and SSE events |
| Assistant session/binding/policy modules | Correlation, authorization, and execution provenance |

## Success metrics

- 100% of successful voice utterances produce one assistant turn.
- Text-only fallback remains available for 100% of tested provider/device failures.
- Stop/interruption ends capture, synthesis, and playback within the governed deadline.
- First audio begins within the agreed latency budget after the first speakable response segment.
- No raw audio is retained unless explicitly enabled.
- Existing text assistant execution and authorization tests remain green.

## Verification order

Run targeted package/API tests after each milestone, then:

```text
pnpm lint:check
bash build-order.sh
pnpm test
pnpm vds:validate
```

Do not mark the integration complete until the real-provider smoke test and the unavailable-provider fallback test both pass.
