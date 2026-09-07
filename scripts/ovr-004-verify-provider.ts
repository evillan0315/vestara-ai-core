/**
 * OVR-004 Helper: Verify provider state.
 *
 * Usage: npx tsx --env-file=.env scripts/ovr-004-verify-provider.ts <sessionId>
 */

import { OpenViduMediaServer } from '../packages/openvidu-adapter/src/openvidu-media-server';

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: ovr-004-verify-provider.ts <sessionId>');
  process.exit(1);
}

const server = new OpenViduMediaServer({
  url: process.env.OPENVIDU_URL!,
  apiBase: process.env.OPENVIDU_API_BASE ?? '/openvidu/api',
  username: process.env.OPENVIDU_USERNAME!,
  secret: process.env.OPENVIDU_SECRET!,
});

async function main() {
  const session = await server.getSession(sessionId);
  const connections = await server.listConnections(sessionId);

  const output = {
    sessionId,
    sessionActive: session?.status === 'active',
    connectionCount: connections.length,
    connections: connections.map((c) => ({
      id: c.id,
      externalId: c.externalConnectionId,
      status: c.status,
      capabilities: c.capabilities,
    })),
    bothActive: connections.length === 2 && connections.every((c) => c.status === 'active'),
  };

  console.log(JSON.stringify(output));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
