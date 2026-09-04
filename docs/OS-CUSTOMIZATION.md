---
title: Vestara OS Customization
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Vestara OS Customization

This document defines how the operating-system presentation should be
customized without coupling branding to the runtime implementation.

## Customization structure

The source layout is:

```text
os/customization/
├── assets/       Canonical logos, colors, fonts, and wallpapers
├── grub/         GRUB theme and boot menu presentation
├── plymouth/     Kernel/initramfs splash theme
├── systemd/      Optional startup presentation units
└── login/        Terminal, display-manager, and workspace presentation
```

The boot sequence has four presentation boundaries:

```text
UEFI firmware
    ↓
GRUB theme                  os/customization/grub
    ↓
Kernel + initramfs splash  os/customization/plymouth
    ↓
Systemd readiness           os/systemd + os/customization/systemd
    ↓
Login/workspace             os/customization/login
```

## GRUB

The image builder should install the reviewed theme at:

```text
/boot/grub/themes/vestara/
```

and configure `/etc/default/grub` with:

```text
GRUB_TIMEOUT=3
GRUB_TIMEOUT_STYLE=hidden
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"
GRUB_THEME="/boot/grub/themes/vestara/theme.txt"
```

It must then run `update-grub` before the image is finalized. GRUB is the
recovery boundary, so retain a visible recovery entry even when the normal
menu is hidden.

## Plymouth

Plymouth owns the visual transition between the kernel and systemd. A theme
should live at:

```text
/usr/share/plymouth/themes/vestara/
```

Install it with:

```bash
plymouth-set-default-theme -R vestara
```

The splash should show a neutral boot state and optionally a readiness state;
it must not imply that Vestara is healthy before `vestara-workspace.service`
has completed successfully.

## Systemd startup

`vestara.target` is the operational boot target. The enabled services are:

- `vestara-host.service`
- `vestara-api.service`
- `vestara-workspace.service`

Branding units may display status or send Plymouth notifications, but they must
not replace service dependencies or suppress failure status. A failed API or
workspace gate should remain visible through `systemctl status` and the boot
journal.

## Login and workspace

Select one login profile per image:

| Profile | Presentation |
| --- | --- |
| Headless | Terminal banner and service status |
| Desktop | Display-manager theme and Vestara workspace shell |
| Recovery | Minimal diagnostic shell |

The image builder currently creates the headless/service profile. Desktop
branding requires a desktop stack and display manager, which are not installed
by the current minimal image builder.

## Image-builder integration

The integration order should be:

1. Install the base OS, kernel, GRUB, and Plymouth packages.
2. Copy reviewed assets from `os/customization/` into the root filesystem.
3. Install and select the Plymouth theme.
4. Configure GRUB and run `update-grub`.
5. Copy Vestara systemd units and enable `vestara.target` plus its services.
6. Validate the image in QEMU before writing it to removable media.

Branding assets are not runtime secrets and should be versioned. Provider
credentials, machine identity, user data, and workspace state must be
provisioned separately after installation.
