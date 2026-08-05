# OS-1 Portable Drive Staging

Run `pnpm os1:plan` to inspect the layout or
`node scripts/os1-portable-drive.mjs stage --output /tmp/vestara-portable-drive --clean` to create a
reproducible staging tree. The tool copies the current systemd units, writes a
minimal configuration, and emits a content-addressed `MANIFEST.json`.

The staged tree enables `vestara.target` from `multi-user.target` and enables
all Vestara services under that target. It is systemd-bootable when installed
under a Linux root filesystem, but it is not a complete hardware-bootable
image: no kernel, initramfs, bootloader, partition table, or EFI binary is
included. It does not format disks or write to block devices.
