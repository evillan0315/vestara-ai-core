# Systemd Profile Configuration

Systemd remains the authority for service lifecycle. Profile configuration may
select optional presentation units, but it must not duplicate or override the
dependencies defined in `os/systemd/vestara.target`.
