---
title: VES-CLINICAL-001 — Intelligent OS for Behavioral Health (Clinical Notes) Plan
version: 1.0.0
status: recorded
owner: vestara
last-reviewed: 2026-10-21
next-review: 2026-11-21
---

# VES-CLINICAL-001 — Intelligent OS for Behavioral Health Plan

> Recorded from clinicalnotes.ai investigation. Not just a note writer —
> Intelligent OS for Behavioral Health as a first-class Vestara package
> (clinical WinType), teal V identity, 32px small clean header, draggable
> VestaraWindow shell.

## Template references

| Artifact | Path |
|---|---|
| Clinical UI template | `../../assets/templates/html/Vestara-Clinical-Notes-Ai.html` |
| Build plan template | `../../assets/templates/html/Vestara-Clinical-Notes-Build-Plan.html` |
| Source copies | `/home/user/Downloads/Vestara-Clinical-Notes-Ai.html`, `/home/user/Downloads/Vestara-Clinical-Notes-Build-Plan.html` |

## Architecture (5 layers from clinicalnotes.ai)

1. **Capture & Context** — ambient live transcription, dictation, group per-member attribution, offline queue, native desktop Windows/Mac capture, 99 languages, no audio retained.
2. **Vestara Integration** — browser widget writes discrete + narrative EHR fields, no API needed, 36+ EHR.
3. **Organizational DNA** — payer/audit/BH MCO/verbiage per program/policies ingested via Connect.
4. **Model Stack** — Whisper STT + LLM for SOAP/BIRP/DAP, 25+ models failover, 15-45 sec generation.
5. **Governance** — glass box explainability (trace why it wrote what), HIPAA SOC2 Type II Zero Retention US-based BAA FERPA 42 CFR Part 2, human judgment stays in charge.

## Current Vestara state

- Phases: boot → login → onboarding → desktop → shutdown.
- VestaraWindow extracted, TopBar 32px, SystemMenu Lockscreen/Switch/Logout/Shutdown, Dock 48px, packages Terminal/Activity/Marketplace/Overview/Settings/Agent/Diagnostic.
- Missing: clinical type — to be added as win-clinical 1080×600.

## Implementation phases

### Phase 1 MVP Week 1-2 Core Scribe

- Left 260px Roster: CLINICAL SCRIBE LIVE, patient search, patient list (Community MH, SUD Group, Crisis Mobile, IDD Waiver), status Recording/Active/Offline, native capture badge.
- Center: Header 44px LIVE SESSION 52min 90834, Start Session/Generate SOAP, tabs Live Transcription/Dictation/Notes/Compliance/History, live transcript speaker badges Clinician #2de8c3 Patient #8ab3ad, fake streaming interval.
- SOAP generation with treatment plan goal verbatim + medical necessity + billing 90834.

### Phase 2 Compliance & DNA Week 3

- Real-time compliance 5-10 sec: length, quotes, word-for-word goals, medical necessity, payer rules, severity low/medium/critical badges, 100% coverage.
- Glass box trace, Organizational DNA panel editable, EHR field mapping.

### Phase 3 Group & Offline Week 4

- Group members separated per-member notes, offline IndexedDB queue sync, 99 languages selector, native desktop capture concept.

### Phase 4 Full Suite Week 5-6

- Products: Document, Comply, Compose (bulk synthesis appeals), Signal (cited decision support), Front Door (AI receptionist), Margin (denials/eligibility HR1 2027), Supervise (practice patients MI/EMDR/CBT/DBT).
- Impact dashboard 46% less time, 80% adoption.

## Tech stack

- Frontend React 18 + TS + Vite + Tailwind + lucide (Mic, FileText, ShieldCheck, Stethoscope) + VestaraWindow shell.
- STT Whisper/Deepgram 99 langs, LLM GPT-4/Claude SOAP/BIRP/DAP, compliance rule engine + LLM trace, EHR browser widget, HIPAA Zero Retention.
