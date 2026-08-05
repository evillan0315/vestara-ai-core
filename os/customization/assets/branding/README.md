# Branding Source Assets

Expected reviewed assets:

```text
branding/
├── colors.json
├── vestara-mark.svg       # optional source logo export
├── vestara-mark.png       # transparent boot/splash export
└── wordmark.svg
```

The supplied source logo is available at `os/customization/assets/logo.svg` and is copied into the GRUB and Plymouth theme staging paths by the image builder. Add a reviewed PNG export if the asset pipeline needs one without SVG conversion.
