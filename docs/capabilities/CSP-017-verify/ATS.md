# Acceptance Test Specification

## Acceptance Criteria

- [ ] Offline operation supported
- [ ] Deterministic verification (no AI required)
- [ ] VerificationReport persisted to SQLite
- [ ] Traceability maintained to Plan, Decision, and ChangeSet
- [ ] Prediction accuracy calculated when assessment data is linked
- [ ] `verify plan <id>` validates task completion
- [ ] `verify workspace` shows health score and category breakdown
- [ ] `verify accuracy` shows prediction error trends
- [ ] No architectural contracts violated
- [ ] All existing tests continue to pass

## Performance Targets

| Operation | Target |
|-----------|--------|
| verify <cs-id> (no shell commands) | <500ms |
| verify plan <id> | <200ms |
| verify workspace | <200ms |
| verify accuracy | <100ms |

## File Locations

| Artifact | Path |
|----------|------|
| VerificationReport | `packages/workspace/src/types.ts` |
| VerificationService | `packages/workspace/src/verification-service.ts` |
| VerificationStorage | `packages/workspace/src/verification-storage.ts` |
| AccuracyStorage | `packages/workspace/src/accuracy-storage.ts` |
| REPL commands | `apps/cli/src/repl-workspace.ts` |
