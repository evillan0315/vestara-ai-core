#!/usr/bin/env node
/**
 * CI-OBS-001 live dogfood helper.
 *
 * Proves the GitHub CI webhook boundary against a running API without GitHub:
 * it signs a `workflow_run` completion with GITHUB_WEBHOOK_SECRET and posts it,
 * then prints the follow-up checklist for the full live run.
 *
 * Usage:
 *   GITHUB_WEBHOOK_SECRET=... node scripts/ci-dogfood.mjs            # dry-run (prints plan)
 *   GITHUB_WEBHOOK_SECRET=... node scripts/ci-dogfood.mjs --send     # POST a signed delivery
 *
 * Env:
 *   VESTARA_API                 API base (default http://127.0.0.1:3001)
 *   GITHUB_WEBHOOK_SECRET       required to sign
 *   CI_DOGFOOD_DELIVERY         delivery id (default unique)
 *
 * The full live run needs GITHUB_TOKEN + a publicly reachable webhook URL; see
 * the checklist printed at the end.
 */

import { createHmac, randomUUID } from 'node:crypto';

const api = (process.env.VESTARA_API ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const secret = process.env.GITHUB_WEBHOOK_SECRET;
const send = process.argv.includes('--send');

const payload = {
  action: 'completed',
  workflow_run: {
    id: Number(process.env.CI_DOGFOOD_RUN_ID ?? 1),
    name: process.env.CI_DOGFOOD_WORKFLOW ?? 'CI',
    status: 'completed',
    conclusion: 'failure',
    head_branch: 'vestara/dogfood',
    head_sha: process.env.CI_DOGFOOD_SHA ?? '0'.repeat(40),
    repository: { id: 1, name: 'dogfood', full_name: 'vestara/dogfood' },
    attempt: 1,
  },
};
const rawBody = JSON.stringify(payload);

function sign(body) {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

async function main() {
  const deliveryId = process.env.CI_DOGFOOD_DELIVERY ?? randomUUID();
  const plan = [
    `POST ${api}/api/github/webhook`,
    `  x-github-event: workflow_run`,
    `  x-github-delivery: ${deliveryId}`,
    `  x-hub-signature-256: ${secret ? '<signed>' : '<MISSING GITHUB_WEBHOOK_SECRET>'}`,
  ];
  console.log('[ci-dogfood] planned delivery:');
  for (const line of plan) console.log(`  ${line}`);

  if (!send) {
    console.log('\n[ci-dogfood] dry run. Re-run with --send to POST the signed delivery.');
    printChecklist();
    return;
  }
  if (!secret) {
    console.error('[ci-dogfood] GITHUB_WEBHOOK_SECRET is required to send.');
    process.exit(2);
  }

  const response = await fetch(`${api}/api/github/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'workflow_run',
      'x-github-delivery': deliveryId,
      'x-hub-signature-256': sign(rawBody),
    },
    body: rawBody,
  });
  console.log(`\n[ci-dogfood] ${response.status} ${response.statusText}`);
  console.log(await response.text());
  printChecklist();
}

function printChecklist() {
  console.log(`
[ci-dogfood] live GitHub run checklist (once GITHUB_TOKEN + public URL exist):
  1. configure a repo webhook -> <public-url>/api/github/webhook (workflow_run, secret)
  2. POST /api/orchestration/projects/:id/tasks/:taskId/push for an in-progress task
  3. confirm the task becomes awaiting-verification with the pushed SHA
  4. wait for the completion delivery; confirm:
       - GET /api/ci/status shows observation + verification + webhookHealth=receiving
       - the task returns to in-progress and externalWait.resumedAt is set
       - Activity Room shows the CI verification record
       - GET /api/ci/status notifications lists the meaningful transition
  5. deliberately fail a check and repeat; confirm no repair/merge is attempted.`);
}

main().catch((error) => {
  console.error('[ci-dogfood] failed:', error);
  process.exit(1);
});
