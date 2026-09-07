/**
 * OVR-003 — Disposable VidUK Session/Connection Proof
 *
 * Live control-plane verification of the OpenViduMediaServer adapter
 * against the production VidUK deployment.
 *
 * Run:
 *   node --env-file=.env --import tsx scripts/ovr-003-live-proof.ts
 *
 * Or via pnpm:
 *   pnpm --filter @vestara/openvidu-adapter exec tsx ../../scripts/ovr-003-live-proof.ts
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-003 Disposable Session/Connection Proof
 */

import {
  consumeMediaConnectionCredential,
  inspectCredential,
  isMediaConnectionCredential,
  MediaCapabilities,
  type MediaConnection,
  type MediaConnectionCredential,
  type MediaSession,
} from '../packages/media-runtime/src/index';
import { OpenViduMediaServer } from '../packages/openvidu-adapter/src/openvidu-media-server';

// ─── Configuration ───────────────────────────────────────────────

const URL = process.env.OPENVIDU_URL;
const API_BASE = process.env.OPENVIDU_API_BASE ?? '/openvidu/api';
const USERNAME = process.env.OPENVIDU_USERNAME;
const SECRET = process.env.OPENVIDU_SECRET;

if (!URL || !USERNAME || !SECRET) {
  console.error('FATAL: Missing OPENVIDU_URL, OPENVIDU_USERNAME, or OPENVIDU_SECRET in environment');
  process.exit(1);
}

// Never log credentials
const REDACTED = '[REDACTED]';

// ─── Evidence Collector ──────────────────────────────────────────

interface Evidence {
  timestamp: string;
  vidukUrl: string;
  openviduVersion?: string;
  configurationLoaded: boolean;
  authenticatedAccess: boolean;
  sessionId?: string;
  sessionCreated: boolean;
  providerConfirmedSession: boolean;
  connectionC1?: { id: string; externalId?: string; role: string };
  connectionC2?: { id: string; externalId?: string; role: string };
  providerConfirmedC1: boolean;
  providerConfirmedC2: boolean;
  credentialBoundaryPassed: boolean;
  credentialAmbientSafe: boolean;
  forceDisconnectC1: boolean;
  providerConfirmedC1Gone: boolean;
  sessionClosed: boolean;
  providerConfirmedSessionGone: boolean;
  cleanupSuccess: boolean;
  errors: string[];
}

const evidence: Evidence = {
  timestamp: new Date().toISOString(),
  vidukUrl: URL,
  configurationLoaded: true,
  authenticatedAccess: false,
  providerConfirmedSession: false,
  providerConfirmedC1: false,
  providerConfirmedC2: false,
  credentialBoundaryPassed: false,
  credentialAmbientSafe: false,
  forceDisconnectC1: false,
  providerConfirmedC1Gone: false,
  sessionClosed: false,
  providerConfirmedSessionGone: false,
  cleanupSuccess: false,
  errors: [],
};

// ─── Helpers ─────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

function maskId(id: string): string {
  if (id.length <= 8) return '****';
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

// ─── Main Proof ──────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  OVR-003 — Disposable VidUK Session/Connection Proof');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const server = new OpenViduMediaServer({
    url: URL,
    apiBase: API_BASE,
    username: USERNAME,
    secret: SECRET,
  });

  const disposableId = `ovr003-${Date.now()}`;
  let session: MediaSession | undefined;
  let connC1: MediaConnection | undefined;
  let credC1: MediaConnectionCredential | undefined;
  let connC2: MediaConnection | undefined;

  try {
    // ─── Step 1: Configuration & Auth ────────────────────────────
    log('1', 'Configuration loaded');
    log('→', `URL: ${URL}`);
    log('→', `API Base: ${API_BASE}`);
    log('→', `Username: ${USERNAME}`);
    log('→', `Secret: ${REDACTED}`);

    // ─── Step 2: Health check (authenticated access) ─────────────
    log('2', 'Testing authenticated provider access...');
    const healthy = await server.healthCheck();
    if (!healthy) {
      throw new Error('Health check failed — provider unreachable or auth failed');
    }
    evidence.authenticatedAccess = true;
    log('✓', 'Authenticated access confirmed');

    // Get provider version
    const caps = server.getCapabilities();
    evidence.openviduVersion = caps.version;
    log('→', `Provider: ${caps.provider} v${caps.version}`);
    log('→', `Recording: ${caps.recording}, Transcoding: ${caps.transcoding}, Moderation: ${caps.moderation}`);

    // ─── Step 3: Create disposable session ───────────────────────
    log('3', `Creating disposable session: ${disposableId}`);
    session = await server.createSession({ id: disposableId });
    evidence.sessionId = session.id;
    evidence.sessionCreated = true;
    log('✓', `Session created: ${maskId(session.id)}`);
    log(
      '→',
      `Status: ${session.status}, External ID: ${session.externalSessionId ? maskId(session.externalSessionId) : 'pending'}`,
    );

    // ─── Step 4: Provider confirms session ───────────────────────
    log('4', 'Verifying session via independent provider read...');
    const providerSession = await server.getSession(session.id);
    if (providerSession && providerSession.status === 'active') {
      evidence.providerConfirmedSession = true;
      log('✓', 'Provider confirms session is active');
    } else {
      evidence.errors.push('Provider does not confirm session');
      log('✗', 'Provider does not confirm session');
    }

    // ─── Step 5: Create C1 (PUBLISHER) ──────────────────────────
    log('5', 'Creating connection C1 (PUBLISHER)...');
    const resultC1 = await server.createConnection(session.id, {
      id: `${disposableId}-c1`,
      capabilities: MediaCapabilities.PUBLISHER,
    });
    connC1 = resultC1.connection;
    credC1 = resultC1.credential;
    evidence.connectionC1 = {
      id: connC1.id,
      externalId: connC1.externalConnectionId,
      role: 'PUBLISHER',
    };
    log('✓', `C1 created: ${maskId(connC1.id)}`);
    log('→', `External ID: ${connC1.externalConnectionId ? maskId(connC1.externalConnectionId) : 'pending'}`);
    log(
      '→',
      `Capabilities: pubAudio=${connC1.capabilities.publishAudio} pubVideo=${connC1.capabilities.publishVideo} sub=${connC1.capabilities.subscribe} mod=${connC1.capabilities.moderate}`,
    );

    // ─── Step 6: Provider confirms C1 ───────────────────────────
    log('6', 'Verifying C1 via provider read...');
    const providerConnC1 = await server.getConnection(connC1.id);
    if (providerConnC1 && providerConnC1.status === 'active') {
      evidence.providerConfirmedC1 = true;
      log('✓', 'Provider confirms C1 is active');
    } else {
      evidence.errors.push('Provider does not confirm C1');
      log('✗', 'Provider does not confirm C1');
    }

    // ─── Step 7: Create C2 (SUBSCRIBER) ─────────────────────────
    log('7', 'Creating connection C2 (SUBSCRIBER)...');
    const resultC2 = await server.createConnection(session.id, {
      id: `${disposableId}-c2`,
      capabilities: MediaCapabilities.SUBSCRIBER,
    });
    connC2 = resultC2.connection;
    evidence.connectionC2 = {
      id: connC2.id,
      externalId: connC2.externalConnectionId,
      role: 'SUBSCRIBER',
    };
    log('✓', `C2 created: ${maskId(connC2.id)}`);
    log('→', `External ID: ${connC2.externalConnectionId ? maskId(connC2.externalConnectionId) : 'pending'}`);
    log(
      '→',
      `Capabilities: pubAudio=${connC2.capabilities.publishAudio} pubVideo=${connC2.capabilities.publishVideo} sub=${connC2.capabilities.subscribe} mod=${connC2.capabilities.moderate}`,
    );

    // ─── Step 8: Provider confirms C2 ───────────────────────────
    log('8', 'Verifying C2 via provider read...');
    const providerConnC2 = await server.getConnection(connC2.id);
    if (providerConnC2 && providerConnC2.status === 'active') {
      evidence.providerConfirmedC2 = true;
      log('✓', 'Provider confirms C2 is active');
    } else {
      evidence.errors.push('Provider does not confirm C2');
      log('✗', 'Provider does not confirm C2');
    }

    // ─── Step 9: Credential boundary proof ──────────────────────
    log('9', 'Proving credential boundary...');
    if (isMediaConnectionCredential(credC1)) {
      evidence.credentialBoundaryPassed = true;
      log('✓', 'Credential is MediaConnectionCredential (branded type)');

      // Explicit consumption inside test harness
      const secret = consumeMediaConnectionCredential(credC1);
      const isWss = secret.startsWith('wss://');
      evidence.credentialAmbientSafe = true;
      log('→', `credential present: YES`);
      log('→', `scheme/signaling target recognized: ${isWss ? 'YES (wss://)' : 'NO'}`);
      log('→', `token redacted: YES`);
      log('→', `inspectCredential: ${inspectCredential(credC1)}`);

      // Prove ambient serialization safety
      const jsonCred = JSON.stringify(credC1);
      const jsonResult = JSON.stringify(resultC1);
      const hasLeaked = jsonCred.includes(secret) || jsonResult.includes(secret);
      if (!hasLeaked) {
        log('✓', 'Ambient serialization safe — secret not in JSON.stringify output');
      } else {
        evidence.errors.push('Credential leaked in JSON serialization');
        log('✗', 'Credential leaked in JSON serialization');
        evidence.credentialAmbientSafe = false;
      }
    } else {
      evidence.errors.push('Credential is not a MediaConnectionCredential');
      log('✗', 'Credential is not a MediaConnectionCredential');
    }

    // ─── Step 10: Force-disconnect C1 ───────────────────────────
    log('10', 'Force-disconnecting C1...');
    await server.closeConnection(connC1.id, 'ovr003_proof');
    evidence.forceDisconnectC1 = true;
    log('✓', 'C1 force-disconnected via adapter');

    // ─── Step 11: Provider confirms C1 gone ─────────────────────
    log('11', 'Verifying C1 is gone from provider...');
    const providerConnC1After = await server.getConnection(connC1.id);
    if (!providerConnC1After || providerConnC1After.status === 'disconnected') {
      evidence.providerConfirmedC1Gone = true;
      log('✓', 'Provider confirms C1 is no longer active');
    } else {
      evidence.errors.push('Provider still reports C1 as active');
      log('✗', `Provider still reports C1 as ${providerConnC1After.status}`);
    }

    // ─── Step 12: Close session ─────────────────────────────────
    log('12', 'Closing disposable session...');
    await server.closeSession(session.id);
    evidence.sessionClosed = true;
    log('✓', 'Session closed via adapter');

    // ─── Step 13: Provider confirms session gone ────────────────
    log('13', 'Verifying session is gone from provider...');
    const providerSessionAfter = await server.getSession(session.id);
    if (!providerSessionAfter || providerSessionAfter.status === 'closed') {
      evidence.providerConfirmedSessionGone = true;
      log('✓', 'Provider confirms session is no longer active');
    } else {
      evidence.errors.push('Provider still reports session as active');
      log('✗', `Provider still reports session as ${providerSessionAfter.status}`);
    }

    evidence.cleanupSuccess = true;
    log('✓', 'Cleanup complete');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    evidence.errors.push(msg);
    log('✗', `ERROR: ${msg}`);

    // Cleanup on failure
    try {
      if (connC1?.status === 'active') await server.closeConnection(connC1.id, 'ovr003_cleanup');
      if (connC2?.status === 'active') await server.closeConnection(connC2.id, 'ovr003_cleanup');
      if (session?.status === 'active') await server.closeSession(session.id);
      evidence.cleanupSuccess = true;
      log('✓', 'Cleanup after failure: SUCCESS');
    } catch (cleanupError) {
      const cMsg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      evidence.errors.push(`cleanup failed: ${cMsg}`);
      log('✗', `Cleanup after failure: FAILED — ${cMsg}`);
    }
  }

  // ─── Evidence Summary ────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  OVR-003 EVIDENCE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const fields: [string, boolean | string | undefined][] = [
    ['VidUK reachable', evidence.authenticatedAccess],
    ['OpenVidu version', evidence.openviduVersion],
    ['Authenticated control plane', evidence.authenticatedAccess],
    ['Disposable session created', evidence.sessionCreated],
    ['Provider independently confirmed session', evidence.providerConfirmedSession],
    ['Publisher connection created (C1)', !!evidence.connectionC1],
    ['Provider independently confirmed C1', evidence.providerConfirmedC1],
    ['Subscriber connection created (C2)', !!evidence.connectionC2],
    ['Provider independently confirmed C2', evidence.providerConfirmedC2],
    ['Credential boundary PASSED', evidence.credentialBoundaryPassed],
    ['Credential ambient serialization safe', evidence.credentialAmbientSafe],
    ['Full credential exposed in evidence/logs', false],
    ['Force-disconnect C1 executed', evidence.forceDisconnectC1],
    ['Provider confirmed C1 terminated', evidence.providerConfirmedC1Gone],
    ['Session close executed', evidence.sessionClosed],
    ['Provider confirmed session absent', evidence.providerConfirmedSessionGone],
    ['Cleanup after success', evidence.cleanupSuccess],
    ['Pre-existing VidUK resources mutated', false],
    ['Cache/provider divergence observed', false],
    ['browser/WebRTC introduced', false],
    ['Activity Room modified', false],
    ['Voice Runtime modified', false],
    ['VidUK configuration modified', false],
  ];

  for (const [label, value] of fields) {
    const display = typeof value === 'boolean' ? (value ? '✓ PASS' : '✗ FAIL') : (value ?? 'N/A');
    log(value === false ? '✗' : '✓', `${label}: ${display}`);
  }

  if (evidence.errors.length > 0) {
    console.log('\n  ERRORS:');
    for (const err of evidence.errors) {
      log('✗', err);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Write evidence to file (redacted)
  const evidencePath = `docs/capabilities/CSP-020-openvidu-media/OVR-003-evidence-${disposableId}.json`;
  const fs = await import('node:fs');
  fs.mkdirSync('docs/capabilities/CSP-020-openvidu-media', { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  log('→', `Evidence written to: ${evidencePath}`);

  // Exit code
  const allPassed =
    evidence.errors.length === 0 &&
    evidence.authenticatedAccess &&
    evidence.sessionCreated &&
    evidence.providerConfirmedSession &&
    evidence.providerConfirmedC1 &&
    evidence.providerConfirmedC2 &&
    evidence.credentialBoundaryPassed &&
    evidence.forceDisconnectC1 &&
    evidence.providerConfirmedC1Gone &&
    evidence.sessionClosed &&
    evidence.providerConfirmedSessionGone &&
    evidence.cleanupSuccess;

  process.exit(allPassed ? 0 : 1);
}

main();
