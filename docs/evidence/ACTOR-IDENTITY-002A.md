---
title: "ACTOR-IDENTITY-002A — Explicit Telegram Principal Enrollment Evidence"
version: 1.0.0
status: implemented
owner: vestara
last-reviewed: 2026-09-25
---

# ACTOR-IDENTITY-002A — Explicit Telegram Principal Enrollment Evidence

## Result

Vestara now has one explicit enrollment operation for associating an existing
Telegram pairing with a selected canonical `HumanPrincipal`.

The operation is:

```text
POST /api/telegram/enroll
Authorization: Bearer <admin credential>
{
  "telegramUserId": "<existing paired Telegram subject>",
  "principalId": "<explicit existing HumanPrincipal.id>"
}
```

The endpoint requires the existing API admin authorization boundary and accepts
only the Telegram subject and canonical principal ID. It does not accept or
inspect a display name, Git identity, OS identity, repository owner, email, or
conversation text.

## Canonical enrollment owner

- `HumanPrincipalStorage` remains the canonical owner of human principals and
  `HumanExternalIdentity` records.
- `TelegramPairingService` remains the owner of Telegram-specific pairing
  evidence and confirms that the subject is actively paired.
- `apps/api/src/telegram-identity.ts` is the single API boundary that combines
  those two authorities for enrollment and resolution.
- No parallel principal registry was introduced.

## Exact explicit binding operation

`enrollTelegramIdentity(telegramUserId, principalId, pairing, principals)`:

1. Requires an active existing `TelegramIdentityBinding` for the supplied
   Telegram subject.
2. Loads the explicitly supplied `principalId` through
   `HumanPrincipalStorage.get()`.
3. Requires the principal to be `active`.
4. Checks the canonical unique external identity key
   `(provider='telegram', subject=telegramUserId)`.
5. Creates the link with
   `HumanPrincipalStorage.linkExternalIdentity()` when absent.
6. Returns the existing canonical binding when the same link already exists.
7. Rejects a link already owned by a different principal.

The Telegram pairing's legacy/local `principalId` is not used as an inferred
target. This is what permits an operator to explicitly enroll a legacy pairing
whose value is `tg-principal-*` into a separately selected canonical principal.

## Persistence mutation

No schema changes were made. The explicit operation writes only the existing
`human_external_identities` table in the workspace `plans.db` through
`HumanPrincipalStorage.linkExternalIdentity()`.

The Telegram pairing remains in `.vestara/telegram.db` under
`telegram_identity_bindings`. Enrollment does not rewrite or delete that row.

## Conflict and idempotency semantics

- First binding: succeeds and persists one `(telegram, subject)` link.
- Same binding repeated: returns the existing canonical binding; no duplicate
  row is created.
- Different principal: fails with the existing canonical conflict semantics;
  the link is never silently moved.
- Unknown principal: fails with `HumanPrincipalNotFoundError`.
- Disabled, suspended, invited, or deleted principal: fails because enrollment
  requires the existing principal lifecycle state `active`.
- Missing or inactive Telegram pairing: fails as unresolved/not actively paired.

Canonical storage already enforces uniqueness of `(provider, subject)` and
idempotence for relinking to the same principal.

## Resolution after enrollment

`resolveTelegramIdentity()` now checks the canonical Telegram external identity
first. Once explicitly enrolled, the Telegram route resolves the canonical
principal even when the old Telegram pairing row still contains a legacy
`tg-principal-*` value. If no canonical link exists, the prior resolution path
may use a pairing whose `principalId` itself names an existing active canonical
principal; otherwise the request remains unresolved.

The route then uses the canonical principal ID for workspace/conversation
binding and router attribution. Activity Room mirroring remains unchanged and
is intentionally outside this milestone.

## Legacy pairing procedure

The existing pairing is not automatically migrated. An operator must:

1. Obtain the existing Telegram subject from the Telegram bindings diagnostic
   route or the pairing record. Do not substitute a display name.
2. Ensure the intended canonical `HumanPrincipal` already exists and is
   `active`. The principal ID must come from the canonical principal authority.
3. Call the authenticated endpoint:

   ```bash
   curl -X POST http://127.0.0.1:3001/api/telegram/enroll \
     -H 'Authorization: Bearer <admin-token>' \
     -H 'Content-Type: application/json' \
     -d '{"telegramUserId":"<paired-telegram-subject>","principalId":"<canonical-principal-id>"}'
   ```

4. Confirm the response contains `status: "enrolled"`, provider `telegram`,
   the requested subject, and the selected canonical principal ID.
5. Send a subsequent Telegram message or run the bounded identity diagnostic;
   routing should now resolve the canonical principal.

This procedure requires explicit operator selection of both existing pairing
and canonical principal. It does not execute enrollment for the legacy
`8531736505 → tg-principal-8531736505` record.

## Focused verification

`apps/api/__tests__/telegram-identity.test.ts` verifies:

- first explicit enrollment succeeds;
- the external identity is persisted through canonical storage;
- repeating the same enrollment is idempotent;
- binding the same subject to another principal fails closed;
- unknown principal fails;
- inactive principal and inactive pairing fail;
- Telegram subject and canonical principal IDs remain distinct;
- display name, Git namespace, and OS namespace cannot establish identity;
- enrollment returns no role or permission authority.

Regression and static verification:

- ACTOR-IDENTITY-002 identity tests: passed;
- Telegram routing/streaming regressions: passed;
- 21 Telegram regression tests: passed;
- API TypeScript `--noEmit` check: passed;
- `git diff --check`: passed.

## Authority non-escalation

Enrollment creates identity ownership only. It does not create or modify:

- workspace membership;
- workspace role;
- permissions;
- execution actor authority;
- agent authority;
- assistant prompt or model context;
- Activity Room grouping.

## Remaining gap before ACTOR-IDENTITY-003

The resolved `HumanPrincipal` is currently used as the canonical routing and
conversation identity, but it is not yet propagated as a typed
conversation/execution `ActorContext` into the assistant runtime. Activity
Room's raw Telegram mirror also remains separate. Those are intentionally
deferred to ACTOR-IDENTITY-003 and later convergence work.
