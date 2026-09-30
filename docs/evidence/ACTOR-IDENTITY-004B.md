# ACTOR-IDENTITY-004B — Authorized Assistant Identity Projection Evidence

Status: complete locally; provider-neutral projection only.

## Projection path

```text
ExecutionActor { kind: 'human', id }
  → HumanPrincipalStorage.get(id)
  → active HumanIdentityRepresentationStorage.get(id)
  → AssistantIdentityContext { preferredName }
```

The resolver is `apps/api/src/assistant-identity.ts`. It rejects absent and
non-human actors, missing principals, inactive principals, unavailable
representations, and storage misses. It does not read Telegram metadata,
external usernames, profile text, Git, OS identity, or model history.

The projection deliberately omits the opaque principal ID from model-facing
identity data. The canonical actor remains available separately as internal
execution provenance.

## Multi-human behavior

Resolution is keyed by the current actor's canonical principal ID. There is no
global representation cache. The storage primary key is `principal_id`, so
two principals cannot share or overwrite one another's representation.

Multiple external identities may continue to resolve to one principal and
therefore one representation; provider identities are not copied into the
projection.

## UNKNOWN and non-authority

No projection is returned for:

- absent actor;
- agent/system/workflow actor;
- missing principal;
- inactive principal;
- absent representation;
- unavailable representation.

No fallback is performed. The projection grants no authentication,
authorization, membership, role, permission, credential, file, execution, or
agent authority.

## Verification

The resolver is covered indirectly by the storage and context tests. The
context suite verifies that the bounded preferred name is the only identity
field rendered and that an actor without a projection remains UNKNOWN.

No real principal or live identity record was modified.

