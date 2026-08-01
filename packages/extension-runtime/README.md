# @vestara/extension-runtime

Transactional local installation and controlled activation for Vestara
extensions. It verifies package contents, resolves installed dependencies,
records permission grants, owns workspace enablement, rolls back failed
activation, cleans contribution registrations, and persists attributable
lifecycle state.

The first implementation accepts unpacked local package directories. Remote
registries, archive extraction, and community-process isolation are deliberately
outside this package's current boundary.
