# OS-2 Portable Drive Image

OS-2 converts an OS-1 staging tree into a deterministic TAR archive and writes
an adjacent JSON metadata manifest containing the archive hash.

It validates the OS-1 manifest and never formats disks, writes `/dev/*`,
installs a bootloader, or changes the current machine. The archive carries the
systemd enablement links from OS-1, but it is not a complete hardware-bootable
disk image.

```bash
pnpm os2:plan
node scripts/os2-portable-drive.mjs image --source /tmp/vestara-os1 --output /tmp/vestara-os2.tar
node scripts/os2-portable-drive.mjs verify --image /tmp/vestara-os2.tar
```

Set `SOURCE_DATE_EPOCH` for reproducible timestamps.




## Hardware-bootable image

After `pnpm build`, run `sudo pnpm os:image -- --output /tmp/vestara.img --size 16G`. This creates a GPT/UEFI image with an EFI System Partition, ext4 root filesystem, kernel, initramfs, GRUB, and enabled Vestara services. It writes only the image file; test it in QEMU before writing removable media.
