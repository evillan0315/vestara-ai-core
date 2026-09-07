/**
 * OVR-004 Helper: Cleanup server-side resources.
 *
 * Usage: npx tsx --env-file=.env scripts/ovr-004-cleanup.ts <sessionId>
 */

import { OpenViduMediaServer } from '../packages/openvidu-adapter/src/openvidu-media-server';

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: ovr-004-cleanup.ts <sessionId>');
  process.exit(1);
}

const server = new OpenViduMediaServer({
  url: process.env.OPENVIDU_URL!,
  apiBase: process.env.OPENVIDU_API_BASE ?? '/openvidu/api',
  username: process.env.OPENVIDU_USERNAME!,
  secret: process.env.OPENVIDU_SECRET!,
});

async function main() {
  try {
    // Close active connections first
    const connections = await server.listConnections(sessionId);
    for (const conn of connections) {
      if (conn.status === 'active') {
        await server.closeConnection(conn.id, 'ovr004_cleanup');
      }
    }

    // Close session
    await server.closeSession(sessionId);

    console.log(JSON.stringify({ cleanupSuccess: true, sessionId }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ cleanupSuccess: false, error: msg, sessionId }));
  }
}

main();
