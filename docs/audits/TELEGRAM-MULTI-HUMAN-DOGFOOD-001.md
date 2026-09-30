# TELEGRAM-MULTI-HUMAN-DOGFOOD-001 — Readiness Audit

Mode: audit only. No second Telegram account, HumanPrincipal, binding, or
representation was created.

## Readiness conclusion

The code now has the required shape for two-human dogfood, but the live API
must first be rebuilt/restarted to load the new representation migration,
admin endpoints, and assistant projection. The operator procedure below is
future work and was not executed.

## Supported operator checklist

### 1. Create Human B's canonical principal

Use the existing authenticated administrative boundary with a valid admin
Bearer token:

```http
POST /api/admin/human-principals
{}
```

Record the generated `hp-*` ID. Do not choose it from Telegram, a name, Git,
OS identity, or the legacy pairing ID.

The endpoint is implemented in `apps/api/src/routes/auth.ts` and delegates to
the API-owned `HumanPrincipalStorage` instance.

### 2. Establish Human B's governed representation

Using the same admin authority and generated principal ID:

```http
POST /api/admin/human-principals/<human-b-id>/representation
{"preferredName":"<explicitly selected name>"}
```

The name must be explicitly supplied by the operator/governed workflow. Do not
copy Telegram `displayName` or `username` automatically. The endpoint accepts
only `preferredName` and optional representation status.

### 3. Pair the Telegram account

The current pairing boundary is:

```http
POST /api/telegram/pairing
{"telegramUserId":"<telegram-b-subject>","telegramDisplayName":"<provider display>"}
```

This creates a short-lived pairing request/token in the Telegram pairing store.
The display name is provider presentation only.

An authenticated operator then approves the token through the existing pairing
approval operation, selecting the already-created canonical principal:

```http
POST /api/telegram/pairing/approve
{
  "token":"<pairing-token>",
  "principalId":"<human-b-id>",
  "principalName":"<pairing presentation only>"
}
```

`TelegramPairingService.approvePairing()` records pairing presentation and
principal reference. It is not a substitute for the canonical external
identity enrollment.

### 4. Enroll the external identity

Use the existing explicit admin enrollment boundary:

```http
POST /api/telegram/enroll
{"telegramUserId":"<telegram-b-subject>","principalId":"<human-b-id>"}
```

The route delegates to `enrollTelegramIdentity()` and
`HumanPrincipalStorage.linkExternalIdentity()`. The subject must be the
existing paired Telegram subject. Conflict and unknown-principal behavior
fails closed.

### 5. Verify without exposing private data

Verify only bounded identifiers and statuses through authenticated/admin
diagnostics:

- `human_principals` contains exactly the intended new principal and active
  status;
- the external identity lookup resolves provider `telegram` + subject to the
  new principal;
- the representation lookup returns status active and the explicitly selected
  preferred name;
- no role, permission, membership, credential, or execution authority changed;
- existing human A records remain unchanged;
- the two Telegram subjects resolve to different principals.

Do not return tokens, unrelated external subjects, private knowledge, or
provider metadata as part of a dogfood proof.

### 6. Alternate messages and prove isolation

Send one message from account A, then one from account B, then alternate. For
each execution verify server-side correlation against the conversation and
canonical `ExecutionActor.id`, not display strings. Confirm:

- A receives only representation A when present;
- B receives only representation B when present;
- no preferred name crosses conversations;
- the model does not receive Telegram username/subject or opaque principal ID
  as conversational identity;
- assistant behavior does not acquire roles or permissions from the name.

### 7. Test UNKNOWN/unpaired behavior

Use a third unpaired Telegram subject in a bounded test path. Expected result:

- canonical resolution remains unresolved;
- no conversation execution is started through the canonical Telegram route;
- no representation is looked up or inferred;
- provider display data is not used as a fallback.

## Restart requirement

Because Task 01 added a plans migration and API routes, the existing systemd
service must be rebuilt/restarted before this procedure can run:

```bash
pnpm build
sudo systemctl restart vestara-api.service
```

This audit did not execute those commands or inspect browser state.

## Remaining unsupported/ambiguous items

- The normal pairing approval route currently accepts a `principalName` for
  pairing presentation; future hardening should make its relationship to the
  governed representation explicit, but this audit does not change it.
- A read-only, privacy-minimized diagnostic endpoint for two-principal proof is
  not a separate new route in this work program; verification should use the
  existing admin and resolver boundaries.
- No second human was enrolled and no representation was created.

