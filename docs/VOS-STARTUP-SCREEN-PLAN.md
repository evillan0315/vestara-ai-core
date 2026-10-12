---
title: VOS Startup Screen Plan — Post-Onboarding / Login-Success Screen for the Vestara OS Image
version: 1.1.0
status: in-progress
owner: vestara
last-reviewed: 2026-10-12
next-review: 2026-11-12
---

# VOS Startup Screen Plan — Post-Onboarding / Login-Success Screen

## Status: IN PROGRESS — P0 artwork + P1 route + P2 readiness landed; P3–P4 remain

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

## Reference fidelity contract

`assets/vestara-desktop-02-screen.png` is the normative visual reference for
the first implementation. It is 1672 × 941 pixels. “Similar” means the
rendered startup route must match this composition; no alternate layout,
generic desktop screen, or framework-default loading page is acceptable.

The implementation must preserve these visible regions and their relative
placement:

| Region | Required appearance |
|---|---|
| Canvas | Full-viewport, edge-to-edge dark space/mountain artwork with no scrollbars or opaque page margins. |
| Upper-left identity | `VESTARA OS` followed by `HUMAN INTELLIGENCE. MULTIPLIED.` in small, widely tracked typography. |
| Upper-right navigation | `PEOPLE  |  AGENTS  |  WORKFLOWS  |  A MORE CAPABLE TOMORROW` plus the cyan terminal line. These are presentation elements, not navigation controls. |
| Center brand | Cyan Vestara mark, `VESTARA`, `AI OPERATING SYSTEM`, and `THINK  ·  PLAN  ·  BUILD  ·  VERIFY  ·  TOGETHER`, centered as one vertical lockup. |
| Readiness card | Translucent dark card with a thin cool border, rounded corners, cyan circular loading indicator, `Starting Vestara OS...`, and `Initializing services, agents and workspace`. |
| Readiness checklist | Six rows: `Core system`, `Agent services`, `Workspace environment`, `Loading user profile...`, `Preparing desktop...`, and `Almost ready...`; completed rows use cyan check circles and pending rows use outlined circles. |
| Lower quote | Centered divider, `“A more capable tomorrow, together.”`, and `— VESTARA`. |
| Lower corners | Version/copyright at lower-left; `POWERED BY OPENCODE` and `BUILT FOR PEOPLE AND AGENTS` plus the cyan terminal line at lower-right. |

The reference is a screenshot baseline, not a background image to place behind
duplicated text. Artwork, logo, typography, card, checklist, and status
indicator must remain independently rendered so runtime state can change.

### Responsive fidelity

- Use the reference viewport as the baseline screenshot size.
- Use a cover-scaled background with a fixed focal point; preserve the planet
  rim, mountain silhouette, and central valley placement.
- Keep the brand lockup and readiness card centered as a group.
- Anchor corner metadata to the viewport edges with tokenized spacing.
- At smaller viewports, scale the composition proportionally and hide only the
  decorative upper-right navigation if it would collide with the brand; never
  move the readiness card into a different layout.
- At no viewport may the browser default body background, loading text, or a
  blank desktop become visible during the startup route.

## Implementation plan for exact reproduction

### P0 — Freeze the visual contract

1. Treat `assets/vestara-desktop-02-screen.png` as the approved screenshot
   baseline and record its 1672 × 941 viewport.
2. Identify or produce the clean background, Vestara mark, wordmark, and footer
   assets separately; do not bake runtime text into the background.
3. Add a startup screenshot fixture and a visual review checklist covering
   every region in the table above.

### P1 — Build the startup route

1. Add `/startup?entry=onboarding|login` to the Workspace application.
2. Build focused components: `StartupCanvas`, `BrandLockup`, `ReadinessCard`,
   `ReadinessChecklist`, and `StartupFooter`.
3. Add `loading`, `ready`, `ready-celebration`, and `degraded` states.
4. Use fixtures first so the reference can be matched before systemd and API
   integration is introduced.
5. Validate with `pnpm vds:validate`, Biome, and the Workspace visual test
   harness.

### P2 — Connect real readiness state

1. Make systemd authoritative for `Core system`, `Agent services`, and
   `Workspace environment`.
2. Resolve the logged-in Linux user to the Vestara Principal before marking
   `Loading user profile...` complete.
3. Make `Preparing desktop...` and `Almost ready...` reflect actual desktop
   and Workspace launch readiness, not timers.
4. Map failures to `degraded` with a diagnostics code and recovery action;
   never leave the user at a blank screen.

### P3 — Integrate first boot and returning-user entry

1. First boot: onboarding completion enters `/startup?entry=onboarding` with
   `ready-celebration` before Workspace opens.
2. Returning user: successful LightDM login starts `/startup?entry=login` and
   must not start onboarding again.
3. Package the LightDM/session autostart bridge under
   `os/customization/login/`.
4. Keep Plymouth, GRUB, and recovery behavior outside this route’s ownership.

### P4 — Validate against the reference and VM flows

1. Add a screenshot baseline at 1672 × 941 and compare with a strict visual
   diff. Review background crop, spacing, typography, cyan accents, card
   opacity, checklist alignment, and footer placement.
2. Run QEMU scenarios for first boot, successful returning-user login,
   healthy service startup, offline/degraded startup, and recovery.
3. Verify there is no Ubuntu/Debian branding, tty, console flash, default
   greeter, or generic desktop between login and this screen.
4. Only after screenshot and VM gates pass should the image builder wire the
   route as the normal desktop handoff.

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

## Implementation record (2026-10-12)

- **P0**: clean 1671 × 941 planet/mountain/valley artwork produced (no baked
  text) at `assets/startup/vestara-desktop-02-screen.png`, vendored to
  `apps/workspace/public/startup/vestara-startup-bg.png` and rendered via the
  `.st-canvas-artwork` cover background with a token scrim.
- **P1**: `/startup?entry=onboarding|login` route landed (`7630681`) with
  `StartupCanvas`, `BrandLockup` (canonical `VestaraMark`, cyan-scoped),
  `ReadinessCard`, `ReadinessChecklist`, `StartupFooter`, fixture-first
  `loading` / `ready` / `ready-celebration` / `degraded` states;
  `pnpm vds:validate` + workspace-ui `tsc -b` + `vite build` green.
- **Remaining**: P3 onboarding-flow hookup (marker writer; launcher defaults
  to `login` until the flow lands), image rebuild + QEMU login-success
  verification, P4 screenshot-diff + QEMU gates.
- **P3**: LightDM/XFCE bridge packaged under `os/customization/login/`
  (seat + greeter confs, `vestara-startup-session.sh` readiness wait with
  bounded fallback to degraded, `vestara-startup.desktop` autostart,
  marker-ready entry resolution) and wired into `scripts/build-vestara-image.sh`
  (`chromium` + `curl`, install + binary assertions, validation.yaml).
- **P2**: readiness hook polls `/api/health/live`, `/api/health`,
  `/api/health/ready` (public) plus `/api/auth/me`, `/api/agents`,
  `/api/host`, `/api/boot` when a session exists; rows derive from probes.
  Codes are structured (`VOS-STARTUP-<CHECK> (GET <path> → <cause>)`,
  5xx-aware agent row); recovery actions are OS-first (systemd/journalctl,
  GRUB recovery entry) with a dev fallback.

## Risks

- Scope creep into Plymouth/GRUB/recovery — contained by non-goals above.
- Second-onboarding UX (returning user re-prompted) — guarded by trigger 2.
- Offline image with no network — degraded state is a first-class
  acceptance criterion, not an afterthought.
