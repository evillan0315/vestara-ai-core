#!/usr/bin/env node
/**
 * Andy McCraw Oct 21 call — rehearsal simulation.
 *
 * Interactive dry run: tech check, timed agenda walkthrough, talk-track
 * cues per demo stop, and a simulated Andy who asks the hard questions.
 *
 * Usage:
 *   node scripts/rehearse-andy-mccraw.mjs            # full interactive rehearsal
 *   node scripts/rehearse-andy-mccraw.mjs --fast      # interactive, timers compressed
 *   node scripts/rehearse-andy-mccraw.mjs --print     # non-interactive: print full script
 *
 * Talk-track lines mirror docs/proposals/PROP-ANDY-MCCRAW-ONEPAGER-001.md.
 * Rehearsal log is written to tmp/ (never docs/ — this is practice, not record).
 */

import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const FAST = process.argv.includes('--fast');
const PRINT = process.argv.includes('--print');
const TICK = FAST ? 0 : 1; // pacing multiplier for scripted pauses

const MEET_URL = 'https://meet.google.com/vyo-giij-mho';

const SECTIONS = [
  {
    id: 'tech',
    title: '0 · Tech check (tonight, not on the call)',
    budgetMin: 15,
    lines: [
      'Run: pnpm install && bash build-order.sh, then pnpm dev (API :3001 + UI :5173).',
      'Re-run: node apps/cli/dist/index.js doctor — expect healthy.',
      'Test Google Meet screen-share of the UI at 1600px.',
      'Open tabs: one-pager, collab record, screenshots folder, this sim log.',
      'Quiet room, Manila evening — water, notebook, charger.',
    ],
    andy: [],
  },
  {
    id: 'reunion',
    title: '1–4 · Reunion: El Guapo, Chip, Remember When, Friends & Family',
    budgetMin: 15,
    lines: [
      'Do NOT rush this — the reunion is what makes the second half work.',
      'Let Andy reminisce. Ask: Lily/family first, then NYC, then retirement life.',
      'Bridge line: "Love this. For the Vestara half I\'ll cover exactly what you asked — market, problem, 10x, path — then I want your optometry + ClinicalNotes findings."',
    ],
    andy: [
      '“So what have you and Lily been up to? Still Quezon City?”',
      '“Man, Welligent — you, me, Chip… we could have done better, huh.”',
    ],
  },
  {
    id: 'demo',
    title: '5 · Vestara session — 5 stops, 2 min each',
    budgetMin: 10,
    lines: [
      'STOP 1 Desktop shell (HOW you get there): "This shell is live today — the OS surface agents will work inside of."',
      'STOP 2 Activity Room (WHY 10x): "Every agent action leaves a governed, inspectable record — oversight built in, not bolted on."',
      'STOP 3 Conversation (PROBLEM): "Agent-built software without controls or human oversight is unshippable — turns here are provider-routed and persisted."',
      'STOP 4 Agents + verification (WHY 10x): "Agents build, verifiers check, evidence is content-addressed — platform vs tool."',
      'STOP 5 Specialty whiteboard (TARGET MARKET): "First wedge: one specialty back office, managed-services-first — then scale across groups on this platform."',
      'If any stop breaks live: narrate over the LinkedIn screenshots. Park anything past 2.5 min.',
    ],
    andy: [
      '“Looks slick — but is this doing real work today, or a demo?” → Point at doctor: kernel running, 85 models routed, audio pipeline ready. Honest scope: shell + governance live, voice UI not yet.',
      '“Why not just use ChatGPT or OpenCode directly?” → "Those are engines. Vestara is the OS around them — controls, verification, evidence, oversight."',
      "“Who verifies the verifier?” → Evidence bundles are content-addressed; human approves at the boundary. Show, don't assert.",
      "“EHR integration is where startups go to die.” → Agree! That's why the wedge starts managed-services — no Epic on day one. Learn workflows, then scale the built solution.",
      "“You're bootstrapped — how do you get there without capital?” → Managed-services wedge funds itself: replace headcount → learn → scale. No big-bang build.",
    ],
  },
  {
    id: 'andy-research',
    title: "6 · Andy's research — YOUR 7 questions (the real agenda, 30+ min)",
    budgetMin: 30,
    lines: [
      'Q1 Optometry: what did you actually find — documents, gaps, pain-$?',
      'Q2 ClinicalNotes.ai: why did ambient-notes-via-Chrome-plugin win — and why sell now (>$100M, 3-yr GTM)?',
      'Q3 Back-office thesis: which specialty back office first for managed-services → learn → scale?',
      'Q4 Voice AI lesson: what killed it — tech, GTM, or unfocused gap?',
      'Q5 SME plan: what profile, what first questions?',
      "Q6 Capacity: advisor / co-founder / researcher / capital — quote him, don't paraphrase.",
      'Q7 Welligent 2.0: what would you do differently this time?',
      'Listen for the wedge signal: NAMED buyer + NAMED workflow + DOLLAR pain + EHR hook. Write each down verbatim.',
    ],
    andy: [],
  },
  {
    id: 'close',
    title: '7 · Close (5 min — next steps, not terms)',
    budgetMin: 5,
    lines: [
      'Mirror back: "Most promising gap sounds like X — did I get that right?"',
      'Propose: (a) you record outcomes in the collab record §9, (b) optional 2-week sprint: SME interview + gap memo, (c) optional wedge proposal.',
      'Explicit: no commitment today; bootstrapped; exploring partnership models only.',
      'Within 24h: thank-you + updated record link + repo link.',
    ],
    andy: [
      "“So what exactly would I do?” → Don't assign him a role on the call. Offer the 2-week research sprint as a no-commitment next step and let him choose his lane.",
    ],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms * TICK));
}

async function techCheck() {
  const results = [];
  const checkPort = async (port, label) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      results.push(`${label} :${port} — ${res.ok ? 'UP' : `HTTP ${res.status}`}`);
    } catch {
      results.push(`${label} :${port} — DOWN (start with: pnpm dev)`);
    }
  };
  await checkPort(3001, 'API');
  await checkPort(5173, 'UI');
  const doctor = await new Promise((resolve) => {
    execFile('node', ['apps/cli/dist/index.js', 'doctor'], { timeout: 60000 }, (err, stdout) => {
      if (err) return resolve('doctor — FAILED to run (rebuild: bash build-order.sh)');
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI color codes from doctor output
      const flat = stdout.replace(/\x1b\[[0-9;]*m/g, '');
      const health = /Overall Health:\s*●?\s*(\w+)/.exec(flat)?.[1] ?? 'unknown';
      resolve(`doctor — Overall Health: ${health}`);
    });
  });
  results.push(doctor);
  results.push(`Meet link — ${MEET_URL} (open it now, confirm screen-share works)`);
  return results;
}

async function runInteractive() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let rlClosed = false;
  rl.on('close', () => {
    rlClosed = true;
  });
  const ask = (q) => {
    // Piped/ended stdin closes readline — treat as "move on" instead of crashing.
    if (rlClosed || rl.closed) return Promise.resolve('');
    return new Promise((resolve) => {
      try {
        rl.question(q, (ans) => resolve(ans));
      } catch {
        resolve('');
      }
    });
  };
  const log = [`# Rehearsal log — ${new Date().toISOString()}`, ''];
  const started = Date.now();

  console.log('\n=== ANDY MCCRAW OCT 21 — REHEARSAL SIM ===');
  console.log(`Meet: ${MEET_URL}\n`);

  const checks = await techCheck();
  console.log('--- tech check ---');
  for (const c of checks) console.log(`  ${c}`);
  log.push('## Tech check', ...checks.map((c) => `- ${c}`), '');

  for (const s of SECTIONS) {
    const t0 = Date.now();
    console.log(`\n=== ${s.title} (budget ~${s.budgetMin} min) ===`);
    for (const line of s.lines) {
      console.log(`  • ${line}`);
      await sleep(150);
    }
    if (s.andy.length > 0) {
      console.log('  --- simulated Andy pushes back ---');
      for (const a of s.andy) {
        console.log(`  ANDY: ${a}`);
        await ask('  YOU (practice your answer, Enter to continue): ');
      }
    } else {
      await ask('  (Enter when ready to move on): ');
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    log.push(`## ${s.title}`, `- rehearsed ${elapsed}s (budget ~${s.budgetMin} min)`, '');
  }

  const takeaway = await ask('\nOne-line takeaway to remember tomorrow: ');
  const total = Math.round((Date.now() - started) / 60000);
  log.push(`Takeaway: ${takeaway || '(none)'}`, `Total rehearsal: ~${total} min`, '');
  rl.close();

  mkdirSync('tmp', { recursive: true });
  const path = `tmp/andy-mccraw-rehearsal-${Date.now()}.md`;
  writeFileSync(path, `${log.join('\n')}\n`);
  console.log(`\nRehearsal log → ${path}`);
  console.log('Break a leg tomorrow. 🍀');
}

function runPrint() {
  console.log(`# Rehearsal script — Andy McCraw Oct 21 (Meet: ${MEET_URL})\n`);
  for (const s of SECTIONS) {
    console.log(`## ${s.title} (~${s.budgetMin} min)`);
    for (const line of s.lines) console.log(`- ${line}`);
    for (const a of s.andy) console.log(`- ANDY: ${a}`);
    console.log('');
  }
}

if (PRINT) runPrint();
else await runInteractive();
