# Systemd Startup Presentation

The authoritative boot dependency is `os/systemd/vestara.target`. Keep
startup ordering and readiness in the service units; use this directory for
optional presentation-only units, such as a boot message bridge or a
Plymouth-ready notification.

Presentation units must not hide service failures or make the API a hard
dependency of the bootloader. The existing `vestara-host`, `vestara-api`, and
`vestara-workspace` services remain the operational authority.
