# Verification evidence manifests

Immutable verification manifests belong in this directory. Each manifest must
contain `runId`, `repository`, an immutable `commit` SHA, an ISO timestamp,
the commands executed, and explicit limitations. Validate them with:

```bash
pnpm docs:evidence
```
