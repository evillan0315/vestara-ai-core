---
title: Andy McCraw Oct 21 Call — One-Pager and Demo Checklist
version: 1.0.0
status: active
id: PROP-ANDY-MCCRAW-ONEPAGER-001
owner: vestara
last-reviewed: 2026-10-20
next-review: 2026-10-22
---

# Andy McCraw Oct 21 Call — One-Pager + Demo Checklist

**When:** Wednesday, October 21, 2026, ~9–11 AM EDT (evening Manila) — Google Meet `meet.google.com/vyo-giij-mho`.
**Who:** Eddie Villanueva (Vestara founder, Quezon City) + Andy McCraw (ex-Welligent CSO, retired spring 2026, NYC) + 1 unconfirmed third guest (invite shows 3 guests, 3 yes; only Andy's and Eddie's addresses visible).
**Reminders:** email 10 min + 30 min before (per invitation).
**Who:** Eddie Villanueva (Vestara founder, Quezon City) + Andy McCraw (ex-Welligent CSO, retired spring 2026, NYC).
**Relationship:** Former Welligent colleagues — Andy mentored Eddie.
**Goal of this call:** Reconnect, show Vestara, hear Andy's optometry / ClinicalNotes.ai research, test fit for a focused specialty-healthcare collaboration. **No commitment or terms on this call** — exploratory only.
**Companion record:** `PROP-ANDY-MCCRAW-COLLAB-RECORD.md` (full LinkedIn source + theses). After the call, append outcomes there.

---

## 1. 30-second opener (set the frame — follow Andy's agenda)

Andy set the agenda: reunion first (Good Old Days / Chip / Remember When / Friends & Family), then the Vestara session. Don't rush the reunion — it's the relationship that makes the second half work.

> "Andy — great to catch up after all these years, and love the agenda. Happy to spend the first half on the good old days — then for the Vestara session I'll cover exactly what you asked: target market, the problem it's solving, why it's 10x better than the alternatives, and how we get there. Then I want to hear your optometry research and ClinicalNotes.ai learnings. Sound good?"

### Vestara session — every demo stop answers one of his 4 questions

| Stop (2 min) | Answers | Say this line |
|--------------|---------|---------------|
| 1. Desktop shell | **How you get there** | "This shell is live today — it's the OS surface agents will eventually work inside of." |
| 2. Activity Room | **Why 10x better** | "Every agent action leaves a governed, inspectable record — oversight built in, not bolted on." |
| 3. Conversation | **Problem solved** | "Agent-built software without controls or human oversight is unshippable — turns here are provider-routed and persisted." |
| 4. Agents + verification | **Why 10x better** | "Agents build, verifiers check, evidence is content-addressed — that's the platform-vs-tool difference." |
| 5. Specialty whiteboard | **Target market** | "First wedge: one specialty-healthcare back office, managed-services-first — then scale across groups on this platform." |

Q&A bridge after the demo: "That was market, problem, 10x, and path — now I want your optometry findings and ClinicalNotes.ai lessons to stress-test the wedge."

---

## 2. Vestara 3-minute pitch (say this, then show)

- **What it is:** AI operating system — platform where AI agents design, build, and orchestrate applications with controls, verification, and human oversight.
- **What's real today (verified `vestara doctor`, Oct 20 — healthy):** kernel running, OpenCode provider healthy (85 models), audio pipeline ready, monorepo `vestara-ai-core` v0.3.0.
- **What you showed already:** GitHub repo + desktop-shell screenshots (shared on LinkedIn).
- **Bridge to his thesis:** "You said focused, EHR-tied, well-researched gap — not another general AI tool. Vestara is the platform that could eventually host purpose-built solutions like that. I'm engineering, you're business/strategy — that's the complementary fit to test."

Do NOT promise: voice UI (capability exists, not in UI yet), any healthcare compliance posture, timelines, or terms. Bootstrapped — resources tight.

---

## 3. Demo flow — 10 minutes, 5 stops (with fallbacks)

Pre-call tech (15 min before): `pnpm install && bash build-order.sh`, `pnpm dev` (API :3001 + UI :5173), open repo + screenshots folder as backup. If live demo breaks, narrate over the screenshots you already sent him.

| # | Stop (2 min each) | Show | Say | Fallback |
|---|-------------------|------|-----|----------|
| 1 | Desktop shell | `DesktopShell.tsx` — boot → login → icons/dock/windows | "This is the OS shell agents will eventually work inside of." | Screenshots from LinkedIn |
| 2 | Activity Room | `/activity` — projection/control surface, records not execution | "Every agent action leaves a governed, inspectable record here." | `assets/screens/activity-room/` PNGs |
| 3 | Conversation | Chat → provider-routed turn, SQLite persisted | "Human ↔ agent turns are first-class, provider-routed." | Describe only |
| 4 | Agents + verification | Canonical agents (`planner/developer/reviewer/verifier`), evidence bundles | "Agents build, verifiers check, evidence is content-addressed — human oversight built in." | `docs/` ADR reference |
| 5 | Specialty bridge | Whiteboard it live: EHR ↔ wedge ↔ Vestara agents | "Imagine your optometry gap here — managed-services wedge first, then scaled across groups on this platform." | Draw on paper, photo after |

Stop rule: if any stop exceeds 2.5 min, park it — Andy's research is the priority.

---

## 4. Questions for Andy (the real agenda — 30+ min)

1. Optometry research: what did you actually find — documents, gaps, who feels the pain, willingness to pay?
2. ClinicalNotes.ai: what made ambient notes via Chrome-plugin-to-EHR valuable — and why is the founder selling now after 3-year GTM (>$100M ask)?
3. Back-office thesis: managed-services-first (replace headcount → learn workflows → scale AI) — which specialty back office would you start with today?
4. Voice AI lesson: what killed the last attempt — tech, GTM, or unfocused gap?
5. SME plan: you mentioned hiring a consultant SME — what profile, what would you ask them?
6. Capacity: retired spring 2026 ("sucked into retirement") — what involvement appeals: advisor, co-founder, researcher, capital?
7. Welligent 2.0: what would you do differently this time?

Listen-for: a named buyer, a named workflow, a dollar pain, an EHR integration point. That is the wedge signal.

---

## 5. Close (5 min — land next steps, not terms)

- Summarize in his words: "So the most promising gap sounds like X — did I get that right?"
- Propose: (a) you record outcomes in the collab record, (b) optional 2-week research sprint: SME interview + gap memo, (c) optional wedge proposal scoped to Vestara roadmap.
- Explicit: no commitment today; bootstrapped; exploring partnership/participation models only.
- Send within 24h: thank-you + link to `PROP-ANDY-MCCRAW-COLLAB-RECORD.md` update + repo link again.

---

## 6. Pre-call checklist (tonight)

- [ ] Build passes, `vestara doctor` healthy (re-run morning of).
- [ ] `pnpm dev` serves API :3001 + UI :5173; test Google Meet screen-share of UI.
- [ ] Screenshots folder open (LinkedIn set + `assets/screens/activity-room/`).
- [ ] This one-pager + collab record open in tabs.
- [ ] Notebook ready: buyer / workflow / pain-$ / EHR-hook per idea Andy mentions.
- [ ] Calendar: confirm 9–11 AM EDT window, Manila evening quiet room.

## 7. Risks (remember on the call)

- Exploratory only; Andy has made no commitment and neither have you.
- Don't treat this note or the collab record as roadmap/milestone authority (per collab record §8).
- Don't quote provider/model provenance you can't prove; don't promise compliance, timelines, or revenue.
