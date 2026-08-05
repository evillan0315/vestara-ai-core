# Vestara OS Customization

This directory is the source structure for the operating-system presentation
layer. It is intentionally separate from runtime services and application UI.

```text
os/customization/
├── assets/       Logos, fonts, wallpapers, and approved color references
├── grub/         UEFI/GRUB menu theme and bootloader presentation
├── login/        Display-manager or terminal-login presentation
├── plymouth/     Kernel/initramfs splash theme
└── systemd/      Boot-stage messages and presentation units
```

The `.example` files are templates. They are not installed by the image
builder until their assets and implementation have been reviewed.
