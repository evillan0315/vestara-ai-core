/**
 * GA-RECOVERY-001A — B: capture the ACTUAL message body sent to the LOCAL
 * OpenCode server by the Floating Assistant conversation path.
 *
 * Uses the SAME `createAssistantOpenCodeExecutor` the API conversation
 * service uses (apps/api), wrapping OpenCodeHttpClient.sendMessage to record
 * the safe request fields: URL path, directory, agent, providerID, modelID.
 * Credentials (Authorization) are NEVER captured.
 */

/* eslint-disable no-console */
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const REPO = '/home/user/projects/vestara/vestara-ai-core';
const ENV = join(REPO, '.env');
if (existsSync(ENV)) {
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { OpenCodeHttpClient } = require(join(REPO, 'packages/opencode-runtime/dist/client/opencode-http-client.js'));
const { resolveOpenCodeConfig } = require(join(REPO, 'packages/opencode-runtime/dist/config.js'));
const { createAssistantOpenCodeExecutor } = require(join(REPO, 'apps/api/dist/assistant-opencode-adapter.js'));
const { OpenCodeRuntimeProvider } = require(join(REPO, 'packages/providers/opencode/dist/index.js'));

(async () => {
  const ocConfig = resolveOpenCodeConfig({});
  const client = new OpenCodeHttpClient(ocConfig);

  // Instrument sendMessage to record the safe message request (no credentials).
  const originalSendMessage = client.sendMessage.bind(client);
  const recorded = [];
  client.sendMessage = async (sessionId, input, context, signal) => {
    const safe = {
      path: `/session/${sessionId}/message?directory=${encodeURIComponent(context.directory)}`,
      directory: context.directory,
      agent: input.agent ?? undefined,
      providerID: input.model?.providerID ?? undefined,
      modelID: input.model?.modelID ?? undefined,
      partType: input.parts?.[0]?.type,
    };
    recorded.push(safe);
    return originalSendMessage(sessionId, input, context, signal);
  };

  // The assistant's authoritative AgentDefinition (from the runtime store) —
  // mirrors what workspace-context resolves at executor construction.
  const assistantAgent = {
    provider: process.env.ASSISTANT_PROVIDER_AUTH ?? 'opencode-go',
    model: process.env.ASSISTANT_MODEL_AUTH ?? 'mimo-v2.5',
  };
  const assistantModel =
    typeof assistantAgent.provider === 'string' && typeof assistantAgent.model === 'string'
      ? { providerID: assistantAgent.provider, modelID: assistantAgent.model }
      : undefined;

  const executor = createAssistantOpenCodeExecutor({
    client,
    workspaceId: 'ga-recovery-001a-probe',
    directory: REPO,
    agent: 'vestara-assistant',
    title: 'Assistant conversation',
    model: assistantModel,
    resolveProviderModel: () => assistantModel ?? undefined,
  });

  const chunks = [];
  for await (const chunk of executor.stream({
    model: '',
    messages: [{ role: 'user', content: 'Reply with exactly: local-ok' }],
  })) {
    chunks.push(chunk);
  }

  console.log('=== captured POST /session/:id/message requests ===');
  for (const r of recorded) console.log(JSON.stringify(r, null, 2));
  const text = chunks
    .filter((c) => c.type === 'text')
    .map((c) => c.content)
    .join('');
  console.log('=== stream ===');
  console.log('text length:', text.length, '| sample:', JSON.stringify(text.slice(0, 40)));
  console.log('chunk types:', [...new Set(chunks.map((c) => c.type))].join(','));
  console.log(
    'has complete:',
    chunks.some((c) => c.type === 'complete'),
  );
  console.log(
    'has error:',
    chunks.some((c) => c.type === 'error'),
  );
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
