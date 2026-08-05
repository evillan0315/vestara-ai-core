# Login Presentation

This layer is reserved for the terminal banner, display-manager theme, or
Vestara workspace shell. It should be selected according to the image profile:

- headless/server image: terminal login and system status only;
- desktop image: display-manager theme and workspace launcher;
- recovery image: minimal diagnostic login with service status visible.

Do not place credentials or provider secrets in this directory.
