# GRUB Customization

GRUB is the first Vestara-owned presentation layer after firmware. The theme
source is `os/customization/grub/theme.txt`; the declarative GRUB configuration
is `os/customization/configs/grub/vestara.cfg`.

The image builder must install the theme, retain a recovery entry, and run
`update-grub` before finalizing the image.
