# OS-3 Controlled Installation

OS-3 installs a verified OS-2 archive into a new directory and writes an
installation receipt. It is a filesystem-tree installer, not an unattended
disk installer.

The command refuses block devices, filesystem root, and existing targets. It
does not partition disks, install bootloaders, or modify the running host.

```bash
pnpm os3:plan
node scripts/os3-installer.mjs install --image /tmp/vestara-os2.tar --target /opt/vestara
```
