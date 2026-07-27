# Vestara Specification-Driven Engineering (VSDE)

## Governing Principle

> Specifications are the primary engineering artifact. Source code is an implementation of those specifications. Verification demonstrates conformance. Metrics determine product success.

## The Engineering Lifecycle

```
Vision
  ↓
Governance
  ↓
Specification
  ↓
Architecture
  ↓
Implementation
  ↓
Verification
  ↓
Measurement
  ↓
Learning
  ↺
```

Every stage produces a durable artifact. No stage begins until the previous stage's artifact is approved.

## VSDE Workflow

```
1. Read Product Principles (docs/PRODUCT-PRINCIPLES.md)
2. Create Capability Specification Package (docs/capabilities/CSP-XXX/)
3. Complete all specification documents
4. Pass specification checklist
5. Implementation begins
6. Verification proves conformance
7. Metrics measure success
8. Documentation updated
```

## Specification Package Structure

Every capability produces a complete engineering package under `docs/capabilities/CSP-XXX-name/`:

| Document | Question Answered |
|----------|------------------|
| `README.md` | What is this capability? |
| `01-overview.md` | Why are we building it? |
| `02-product.md` | What does the user gain? |
| `03-user-experience.md` | What does it feel like? |
| `04-domain-model.md` | What new artifacts exist? |
| `05-architecture.md` | Which components are reused or created? |
| `06-storage.md` | Where is data persisted? |
| `07-cli.md` | What are the exact commands? |
| `08-api.md` | How will future interfaces consume it? |
| `09-security.md` | What permissions and audit are needed? |
| `10-performance.md` | What are the timing targets? |
| `11-testing.md` | How is it validated? |
| `12-rollout.md` | How is it introduced? |
| `13-decisions.md` | What tradeoffs were made? |
| `14-checklist.md` | Is everything approved? |

## Specification Checklist

No implementation begins until all items pass:

```
□ Product approved
□ UX approved
□ Architecture approved
□ Domain model approved
□ Storage approved
□ ATS complete
□ Performance targets defined
□ Security reviewed
□ Rollout documented
```

## Document → Code Mapping

```
docs/capabilities/CSP-XXX-name/
  ↓
packages/<owner>/<implementation>/
  ↓
apps/cli/src/repl-*.ts
  ↓
tests/
```

The documentation structure mirrors the code structure. Each CSP maps to one package area.

## AI Integration

```
Capability Package
  ↓
AI reads specification
  ↓
AI implements documented behavior
  ↓
AI validates against ATS
  ↓
AI updates implementation status
  ↓
Human reviews
```

The AI never invents behavior — it implements documented behavior.

## CI Pipeline

```
Validate Markdown → Validate References → Validate Domain Models →
Validate ATS Completeness → Implementation Allowed → Compile →
Test → Verify → Release
```

Documentation quality is a build gate. A capability cannot be implemented until its specification is complete and approved.

## Capability Maturity

Every capability tracks maturity across dimensions:

```
Specification:    100%
Architecture:     100%
Implementation:   60%
Verification:     20%
Metrics:           0%
```

This is exposed via the capability registry and prevents partial implementations from being considered "complete."
