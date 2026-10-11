---
title: VOS Startup Screen Plan — Post-Onboarding / Login-Success Screen for the Vestara OS Image
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-11
next-review: 2026-11-11
---

# VOS Startup Screen Plan — Post-Onboarding / Login-Success Screen

## Status: DRAFT — Pending Director Approval

## Executive Summary

No existing milestone covers the **OS startup screen**: the first Vestara
Workspace screen shown on the Vestara OS image **after OS onboarding
completes (first boot) or login succeeds (returning user)**. The boot chain
is specified (`PCS-017-boot-experience.md`, milestone `VOS-BOOT-001`), the
startup orchestration is specified (milestone `VOS-LIVE-001I`), and desktop
integration is specified (milestone `VOS-LIVE-001J`) — but all three stop at
"Vestara Workspace/Tauri launches." This plan defines the screen that owns
that handoff.

## Gap Analysis (evidence)

| Candidate owner | Covers | Verdict |
|---|---|---|
| `VOS-BOOT-001` Unified Boot Experience (`packages/workspace/src/milestone-service.ts`) | GRUB → Plymouth → systemd → desktop | Boot splash only, ends at desktop session. **Gap.** |
| `VOS-LIVE-001I` Startup Experience | Health-based, dependency-aware startup, diagnostics codes, offline operation | Backend orchestration, no visual screen. **Gap.** |
| `VOS-LIVE-001J` Desktop Integration | XFCE + Workspace shell surfacing | Shell hosting, no startup screen. **Gap.** |
| `VOS-LIVE-001H` Identity & Session | Linux user → Vestara Principal | Identity mapping, no screen. **Gap.** |
| `v4.0` Conversational Onboarding (completed) + `ATS-011-conversational-onboarding.md` | Workspace-level onboarding flow | Ends at onboarding completion; no post-onboarding handoff target. **Gap.** |
| `PCS-017-boot-experience.md` Phase 7 | systemd → API → Workspace → desktop session sequence | Stops at "Vestara Workspace/Tauri". **Gap.** |
| `plans` table (`.vestara/plans/plans.db`) | 0 rows — no stored plan covers this | **Gap confirmed.** |

Related reading: `PCS-017-boot-experience.md`, `ATS-011-conversational-onboarding.md`,
`OS-CUSTOMIZATION.md`, `plymouth/README.md`, `image-builder/README.md`,
`governance/UI-UX-GOVERNANCE.md`.

## Goal

On the Vestara OS image, after (a) first-boot onboarding completes or (b) a
returning user logs in successfully, show a branded, health-gated Vestara
startup screen that transitions seamlessly into the Workspace — with no
Ubuntu/Debian branding, no console spam, and no dead-end desktop.

Non-goals: changing the Plymouth theme, the GRUB menu, the recovery path, or
the onboarding conversation itself.

## Entry Points & Triggers

1. **First boot:** onboarding completion event (ATS-011 authority) →
   startup screen in `ready-celebration` state → Workspace.
2. **Returning user:** LightDM login success → XFCE session autostart →
   `vestara.target` healthy → API healthy → Workspace/Tauri opens directly
   on the startup route (no second onboarding — see Invitations &
   Onboarding milestone: "no second onboarding authority").
3. **Degraded boot:** health gate fails or offline (per `VOS-LIVE-001I`) →
   startup screen in `degraded` state with a structured diagnostics code,
   never a blank desktop or terminal.

## UX Specification

- **Continuity:** same background asset as Plymouth/login/desktop/lock per
  the PCS-017 rule (background carries no wordmark, progress, or state —
  those render separately).
- **Composition:** `PageHero` + `SectionCard` (React 19, functional), states:
  `loading` (health gate) → `ready` / `ready-celebration` (first boot) /
  `degraded` (diagnostics code + recovery entry) .
- **Styling:** Vestara tokens only (`var(--vestara-*)` from
  `packages/ui-tokens/src/tokens.ts`), governed Tailwind v4, validated via
  `pnpm vds:validate`. See `governance/UI-UX-GOVERNANCE.md`.
- **Data:** API first; local `*.fixtures.ts` fallback while the health gate
  is pending; never hardcoded arrays in JSX.

## Technical Design

- **Route:** new Workspace startup route (e.g. `/startup?entry=onboarding|login`)
  owned by `apps/workspace` (`@vestara/workspace-ui`); deep-linkable from
  the Tauri shell autostart entry.
- **Health gate:** reuse the Phase 7 sequence (systemd → API → Workspace
  service); poll readiness, honor offline/local per `VOS-LIVE-001I`.
- **Identity:** resolve the desktop user to a Vestara Principal via the
  `VOS-LIVE-001H` adapter at screen entry; login-success carries the
  session, never re-prompts.
- **OS packaging:** LightDM greeter theme + XFCE autostart entries live in
  `os/customization/login/` (currently README-only) and are installed by
  the image builder (`scripts/build-vestara-image.sh`,
  `scripts/copy-plymouth-assets.sh` pattern).
- **Recovery untouched:** GRUB recovery boundary and repair-boot paths are
  out of scope and must keep working independently of this screen.

## Phases & Acceptance Criteria

1. **Workspace startup route + states** — route renders all four states
   against fixtures; `vds:validate` + Biome clean.
2. **Login/greeter + autostart packaging** — `os/customization/login/`
   gains greeter theme + autostart entries; returning-user login lands on
   the startup screen, first boot lands on onboarding then the screen.
3. **Builder integration** — image builder installs the above; VM boot shows
   zero Ubuntu/Debian branding end-to-end.
4. **Verification (VM-first per `VOS-LIVE-001Q`)** — QEMU boot: first-boot
   path, login-success path, offline/degraded path; Playwright
   `screenshots:ci` baselines for the new route.
5. **Milestone proposal** — propose a sub-milestone (e.g. under
   `VOS-LIVE-001I`/`VOS-LIVE-001J` or a PCS-017 addendum) in
   `packages/workspace/src/milestone-service.ts`; do not hand-edit
   milestone state without Director approval.

## Risks

- Scope creep into Plymouth/GRUB/recovery — contained by non-goals above.
- Second-onboarding UX (returning user re-prompted) — guarded by trigger 2.
- Offline image with no network — degraded state is a first-class
  acceptance criterion, not an afterthought.
