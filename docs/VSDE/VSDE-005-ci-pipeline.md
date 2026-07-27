# VSDE-005 — CI Pipeline

## Specification Gate (future)

```
Validate Markdown structure
Validate metadata headers
Validate cross-references
Validate artifact references
Validate ATS completeness
→ If incomplete: BUILD FAILED — Specification incomplete
→ If complete: proceed to implementation
```

## Compilation Gate

```
bash build-order.sh
→ If fails: BUILD FAILED — Compilation error
```

## Test Gate

```
vitest run
→ If fails: BUILD FAILED — Test failure
```

## Verification Gate

```
vestara doctor
vestara demo golden-path
→ If fails: BUILD FAILED — Verification failure
```

## Release Gate

```
All previous gates pass
Specification is current with implementation
Documentation updated
→ Release
```
