/**
 * OVR-004 Helper: Create server-side session and credentials.
 *
 * Usage: npx tsx --env-file=.env scripts/ovr-004-create-credentials.ts <sessionId>
 *
 * Outputs JSON with session info and credential token values (for browser injection).
 * The token values are consumed ephemerally by the test harness — never logged or persisted.
 */

import { consumeMediaConnectionCredential, MediaCapabilities } from '../packages/media-runtime/src/index';
import { OpenViduMediaServer } from '../packages/openvidu-adapter/src/openvidu-media-server';

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: ovr-004-create-credentials.ts <sessionId>');
  process.exit(1);
}

const server = new OpenViduMediaServer({
  url: process.env.OPENVIDU_URL!,
  apiBase: process.env.OPENVIDU_API_BASE ?? '/openvidu/api',
  username: process.env.OPENVIDU_USERNAME!,
  secret: process.env.OPENVIDU_SECRET!,
});

async function main() {
  // Create session
  const session = await server.createSession({ id: sessionId });

  // Create C1 (PUBLISHER)
  const resultC1 = await server.createConnection(session.id, {
    id: `${sessionId}-c1`,
    capabilities: MediaCapabilities.PUBLISHER,
  });

  // Create C2 (SUBSCRIBER)
  const resultC2 = await server.createConnection(session.id, {
    id: `${sessionId}-c2`,
    capabilities: MediaCapabilities.SUBSCRIBER,
  });

  // Extract tokens server-side (ephemeral — for browser injection only)
  const tokenA = consumeMediaConnectionCredential(resultC1.credential);
  const tokenB = consumeMediaConnectionCredential(resultC2.credential);

  // Output structured data (token values included for browser injection)
  const output = {
    sessionId: session.id,
    externalSessionId: session.externalSessionId,
    connectionA: {
      id: resultC1.connection.id,
      externalId: resultC1.connection.externalConnectionId,
      role: 'PUBLISHER',
    },
    connectionB: {
      id: resultC2.connection.id,
      externalId: resultC2.connection.externalConnectionId,
      role: 'SUBSCRIBER',
    },
    // Token values for browser injection — consumed ephemerally
    credentialA: { tokenValue: tokenA },
    credentialB: { tokenValue: tokenB },
  };

  console.log(JSON.stringify(output));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
