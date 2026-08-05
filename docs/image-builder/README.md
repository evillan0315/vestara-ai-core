# Image Builder Customization

The declarative image profile manifests are under
`os/customization/builder/`:

- `image.yaml` — image format, profiles, bootloader, and runtime root;
- `packages.yaml` — base and profile package requirements;
- `validation.yaml` — required files, services, and post-build checks.

The current `scripts/build-vestara-image.sh` produces the UEFI filesystem image
and enables the core Vestara services. Desktop packages, display-manager
themes, final Plymouth artwork, and supplied logo assets remain profile assets
until explicitly added and reviewed.
