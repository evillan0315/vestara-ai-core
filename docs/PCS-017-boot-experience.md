---
title: PCS-017 — Vestara Unified Boot Experience
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-017 — Vestara Unified Boot Experience

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-017 |
| Name | Vestara Unified Boot Experience |
| Version | 1.0 |
| Status | Planned (VOS-BOOT-001) |

---

## Goal

Deliver a coordinated boot experience across GRUB → Plymouth → systemd → desktop session. The user should never see Ubuntu/Debian branding, console spam, a blinking cursor, or an unrelated display-manager screen during the normal path. Recovery must remain accessible.

## Architecture

```text
                    VESTARA OS BOOT
                          │
                          ▼
                 ┌─────────────────┐
                 │ UEFI / Firmware │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │   Vestara GRUB  │
                 │ recovery boundary│
                 └────────┬────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   Vestara Plymouth   │
              │                      │
              │       VESTARA        │
              │ Building Tomorrow... │
              │ ━━━━━━━━━━━━━━━━━━━  │
              └──────────┬───────────┘
                         │ projection
                         ▼
              ┌──────────────────────┐
              │       systemd        │
              │                      │
              │ vestara-host         │
              │      ↓               │
              │ vestara-api          │
              │      ↓               │
              │ vestara-workspace    │
              │      ↓               │
              │ vestara.target       │
              └──────────┬───────────┘
                         │
                       READY
                         │
                         ▼
               ┌────────────────────┐
               │  Desktop Session   │
               │   XFCE / LightDM   │
               └─────────┬──────────┘
                         │
                         ▼
               ┌────────────────────┐
               │ Vestara Workspace  │
               │       Tauri        │
               └────────────────────┘
```

**Key principle**: systemd remains authoritative for boot state. Plymouth is only the projection. The generated design image (`assets/vestara-desktop-boot-screen.png`) is the UX specification, not the literal boot implementation.

## Presentation boundaries

| Boundary | Ownership | Directory |
|----------|-----------|-----------|
| UEFI firmware → GRUB theme | GRUB | `os/customization/grub/` |
| Kernel + initramfs splash | Plymouth | `os/customization/plymouth/` |
| Systemd readiness | systemd units | `os/systemd/` + `os/customization/systemd/` |
| Login / workspace | Display manager | `os/customization/login/` |

## Phases

### Phase 1 — Canonical boot branding assets

Turn generated artwork into proper OS assets with separation of concerns.

**Target structure**:

```text
os/customization/assets/
├── brand/
│   ├── vestara-logo.svg
│   ├── vestara-logo-light.svg
│   └── wordmark.svg
├── boot/
│   ├── boot-background-1920x1080.png
│   ├── boot-background-2560x1440.png
│   ├── boot-background-3840x2160.png
│   └── boot-background-fallback.png
├── desktop/
│   ├── wallpaper-1920x1080.png
│   ├── wallpaper-2560x1440.png
│   └── wallpaper-3840x2160.png
└── tokens/
    └── brand.json
```

**Rule**: The background must not contain the wordmark, progress bar, percentage, status messages, or runtime state. Those are rendered separately. One background reused for Plymouth, login, desktop, lock screen, and recovery.

### Phase 2 — Production Plymouth theme

Replace the minimal gradient + logo proof-of-concept with a full Vestara Plymouth theme.

**Target structure**:

```text
os/customization/plymouth/
├── vestara.plymouth
├── vestara.script
├── assets/
│   ├── background.png
│   ├── wordmark.png
│   ├── progress-track.png
│   ├── progress-fill.png
│   ├── spinner/
│   └── status-icons/
└── README.md
```

**Visual target**:

```text
                V E S T A R A


          BUILDING TOMORROW, TOGETHER




          ━━━━━━━━━━━━━━━━━━━━━━━
             INITIALIZING...
```

Use a subtle animated progress rail instead of a fake percentage. systemd boot is not a simple 0–100 linear process.

### Phase 3 — Systemd readiness projection

Plymouth reflects real Vestara boot states driven by actual service transitions.

**Systemd flow**:

```text
systemd
   │
   ├── vestara-host.service
   │        ↓
   ├── vestara-api.service
   │        ↓
   ├── vestara-workspace.service
   │        ↓
   └── vestara.target
             │
             ▼
          Plymouth
             │
             ▼
        VESTARA READY
```

**Status messages**:

```text
INITIALIZING SYSTEM
STARTING VESTARA CORE
STARTING RUNTIME
STARTING API
STARTING WORKSPACE
PREPARING DESKTOP
VESTARA READY
```

**Presentation units**:

```text
os/customization/systemd/
├── vestara-boot-status.service
├── vestara-boot-ready.service
└── vestara-boot-failed.service
```

**Invariant**: Plymouth must not imply Vestara is healthy before `vestara-workspace.service` has actually succeeded.

### Phase 4 — Failure presentation

Don't hide boot failures behind pretty graphics.

**API failure**:

```text
VESTARA

STARTUP DEGRADED

API SERVICE FAILED

Press Esc for system details
```

**Workspace failure**:

```text
WORKSPACE UNAVAILABLE

System services are running.
Desktop workspace could not be started.
```

Recovery information remains accessible through the journal and `systemctl`. Consistent with the existing OS customization contract: branding must not replace dependencies or suppress failure information.

### Phase 5 — Desktop profile

Add image profiles instead of modifying the base image into a desktop-only image.

**Target structure**:

```text
os/customization/builder/
├── image.yaml
├── packages.yaml
├── validation.yaml
└── profiles/
    ├── headless.yaml
    ├── desktop.yaml
    └── recovery.yaml
```

**Profiles**:

```text
Vestara OS Base
     │
     ├── headless
     ├── desktop
     └── recovery
```

Desktop profile uses **XFCE + LightDM** — lightweight shell whose visible identity is Vestara.

### Phase 6 — Seamless Plymouth → desktop transition

Use the same background composition for Plymouth → LightDM → XFCE desktop.

During Plymouth:

```text
VESTARA
BUILDING TOMORROW, TOGETHER

━━━━ boot animation ━━━━
```

Then Plymouth fades. The desktop appears with essentially the same wallpaper underneath. One continuous screen instead of alternating black screens.

### Phase 7 — Vestara Desktop startup

Once the desktop session starts, React/Tauri becomes relevant.

**Sequence**:

```text
systemd
   ↓
vestara.target
   ↓
API healthy
   ↓
Workspace service healthy
   ↓
desktop session
   ↓
Vestara Workspace/Tauri
```

The first production-ready desktop remains recoverable as a normal Linux desktop. A dedicated "Vestara Workspace Session" where Workspace becomes the desktop shell is a separate milestone.

### Phase 8 — GRUB visual continuity

GRUB is visually simpler than Plymouth:

```text
             VESTARA


          Start Vestara OS


          Recovery
          Diagnostics
          Debian Live
```

Dark background. Small logo. No giant animation. Normal startup hidden with 3-second timeout; keyboard interaction reveals the menu. GRUB remains the recovery boundary.

### Phase 9 — Debian Live integration

Two artifacts share presentation:

```text
Vestara OS
├── installed image
└── Debian Live image
```

Both consume `os/customization/assets`, `os/customization/grub`, `os/customization/plymouth`, `os/customization/login`. The Live image needs additional boot semantics:

```text
Try Vestara
Vestara Persistent
Recovery
Diagnostics
Installer
```

### Phase 10 — Image builder refactor

Split the monolithic `build-vestara-image.sh` into composable stages.

**Target**:

```text
scripts/os/
├── build-image.sh
├── bootstrap-rootfs.sh
├── install-packages.sh
├── install-branding.sh
├── install-grub.sh
├── install-plymouth.sh
├── install-desktop.sh
├── install-vestara.sh
├── validate-image.sh
└── qemu-smoke-test.sh
```

**Pipeline**:

```text
build → bootstrap → packages → branding → bootloader → plymouth → desktop → Vestara runtime → validation → artifact
```

### Phase 11 — Validation

Startup branding must be testable, not accepted on faith.

| ID | Criterion |
| ---- | --------- |
| VOS-BOOT-V01 | UEFI boot succeeds |
| VOS-BOOT-V02 | GRUB theme loads |
| VOS-BOOT-V03 | Recovery entry remains accessible |
| VOS-BOOT-V04 | Plymouth loads at native resolution |
| VOS-BOOT-V05 | No Debian/Ubuntu artwork appears |
| VOS-BOOT-V06 | No unexpected console flash |
| VOS-BOOT-V07 | API failure produces degraded state |
| VOS-BOOT-V08 | Workspace failure produces degraded state |
| VOS-BOOT-V09 | Successful boot reaches Vestara desktop |
| VOS-BOOT-V10 | Plymouth → desktop transition is clean |
| VOS-BOOT-V11 | 16:9 / 16:10 / fallback resolutions work |
| VOS-BOOT-V12 | Escape exposes diagnostic boot output |
| VOS-BOOT-V13 | Shutdown/reboot presentation works |
| VOS-BOOT-V14 | Headless image remains unaffected |
| VOS-BOOT-V15 | Recovery image remains independent |

## Existing infrastructure

The repository already defines approximately 50–60% of the needed infrastructure:

- ✅ UEFI GPT image construction (`scripts/build-vestara-image.sh`)
- ✅ GRUB customization (`os/customization/grub/`, `quiet splash`)
- ✅ Plymouth installation and theme (`os/customization/plymouth/`)
- ✅ `vestara.target` with `vestara-host`, `vestara-api`, `vestara-workspace` services
- ✅ OS asset organization (`os/customization/assets/`, `assets/`)
- ✅ Image profile model (`os/customization/profiles/`)
- ✅ Boot runtime state machine (`packages/boot-runtime/`)
- ✅ GRUB timeout=3, timeout_style=hidden, splash on kernel command line

**Missing work**: Production-grade visual theme, desktop profile, real readiness projection, failure UX, Live-image integration, boot validation.

## Related documents

- PCS-016: `docs/PCS-016-os-integration.md`
- OS Customization: `docs/OS-CUSTOMIZATION.md`
- AI OS Architecture: `docs/AI-OS-ARCHITECTURE.md`
- OS README: `os/README.md`
- Boot Runtime: `packages/boot-runtime/README.md`
