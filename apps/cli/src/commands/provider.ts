import * as path from 'node:path';
import type { ModelConfig, ProviderConfig, WorkspaceManifestData } from '@vestara/workspace';

const GOLD = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GRAY = '\x1b[90m';
const CYAN = '\x1b[36m';

const wsDir = path.join(process.cwd(), '.vestara');

async function loadManifest(): Promise<WorkspaceManifestData> {
  const { WorkspaceManifest } = await import('@vestara/workspace');
  const existing = await WorkspaceManifest.load(wsDir);
  if (!existing) {
    const fingerprint = {
      id: 'default',
      name: path.basename(process.cwd()),
      canonicalPath: process.cwd(),
      gitRoot: null,
      gitRemote: null,
      gitBranch: null,
      gitCommit: null,
      repositoryHash: '',
      fingerprintedAt: new Date().toISOString(),
    };
    const analysis = {
      name: fingerprint.name,
      language: 'typescript',
      isMonorepo: false,
      fileCount: 0,
      totalSizeKB: 0,
      packageCount: 0,
      dependencyCount: 0,
      entryPoints: [],
      risks: [],
      packages: [],
      hasDocker: false,
      hasCI: false,
      detectedAt: new Date().toISOString(),
    };
    return await WorkspaceManifest.create(wsDir, fingerprint, analysis);
  }
  return existing;
}

async function saveManifest(data: WorkspaceManifestData): Promise<void> {
  const { WorkspaceManifest } = await import('@vestara/workspace');
  await WorkspaceManifest.save(wsDir, data);
}

function getProviders(data: WorkspaceManifestData): ProviderConfig[] {
  return data.providers ?? [];
}

function setProviders(data: WorkspaceManifestData, providers: ProviderConfig[]): void {
  data.providers = providers;
}

function findProvider(data: WorkspaceManifestData, id: string): ProviderConfig | undefined {
  return getProviders(data).find((p) => p.id === id);
}

export async function runProviderAddLocal(args: string[]): Promise<void> {
  const name = args[0] || 'ollama';
  let baseUrl = 'http://127.0.0.1:11434/v1';
  let apiKeyEnv: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--base-url' && args[i + 1]) baseUrl = args[++i];
    else if (args[i] === '--api-key-env' && args[i + 1]) apiKeyEnv = args[++i];
  }

  const data = await loadManifest();
  const providers = getProviders(data);

  if (providers.find((p) => p.id === name)) {
    console.log(`  ${RED}Provider "${name}" already exists.${RESET}\n`);
    return;
  }

  const now = new Date().toISOString();
  const localModels = [
    {
      id: 'deepseek-coder:1.3b',
      name: 'DeepSeek Coder 1.3B',
      contextWindow: 8192,
      maxOutput: 4096,
      caps: 'chat,stream',
    },
  ];

  providers.push({
    id: name,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    baseUrl,
    apiKeyEnv,
    enabled: true,
    models: localModels.map((m) => ({
      id: m.id,
      name: m.name,
      enabled: false,
      contextWindow: m.contextWindow,
      maxOutput: m.maxOutput,
      capabilities: {
        chat: m.caps.includes('chat'),
        streaming: m.caps.includes('stream'),
        functionCalling: m.caps.includes('fn-call'),
        vision: m.caps.includes('vision'),
      },
    })),
    createdAt: now,
    updatedAt: now,
  });

  setProviders(data, providers);
  await saveManifest(data);

  console.log(`  ${GREEN}✓${RESET} Local provider ${GOLD}${name}${RESET} added`);
  console.log(`       ${GRAY}Base URL: ${baseUrl}${RESET}`);
  console.log(
    `       ${GRAY}Models: ${localModels.length} pre-registered (all disabled — enable with "provider model enable")${RESET}`,
  );
  console.log(`       ${GRAY}Enable a model: vestara provider model enable ${name} <model-id>${RESET}`);
  console.log();
}

export async function runProviderAdd(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.log(
      `${RED}Usage: vestara provider add <id> [--name <name>] [--base-url <url>] [--api-key-env <env>]${RESET}\n`,
    );
    return;
  }

  let name = id;
  let baseUrl: string | undefined;
  let apiKeyEnv: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) name = args[++i];
    else if (args[i] === '--base-url' && args[i + 1]) baseUrl = args[++i];
    else if (args[i] === '--api-key-env' && args[i + 1]) apiKeyEnv = args[++i];
  }

  const data = await loadManifest();
  const providers = getProviders(data);

  if (providers.find((p) => p.id === id)) {
    console.log(`  ${RED}Provider "${id}" already exists.${RESET}\n`);
    return;
  }

  const now = new Date().toISOString();
  providers.push({
    id,
    name,
    baseUrl,
    apiKeyEnv,
    enabled: true,
    models: [],
    createdAt: now,
    updatedAt: now,
  });

  setProviders(data, providers);
  await saveManifest(data);

  console.log(`  ${GREEN}✓${RESET} Provider ${GOLD}${id}${RESET} added (${GRAY}${name}${RESET})`);
  if (baseUrl) console.log(`       ${GRAY}Base URL: ${baseUrl}${RESET}`);
  if (apiKeyEnv) console.log(`       ${GRAY}API Key: \${${apiKeyEnv}}${RESET}`);
  console.log();
}

export async function runProviderRemove(id: string): Promise<void> {
  if (!id) {
    console.log(`${RED}Usage: vestara provider remove <id>${RESET}\n`);
    return;
  }

  const data = await loadManifest();
  const providers = getProviders(data);
  const idx = providers.findIndex((p) => p.id === id);
  if (idx === -1) {
    console.log(`  ${RED}Provider "${id}" not found.${RESET}\n`);
    return;
  }

  providers.splice(idx, 1);
  setProviders(data, providers);
  await saveManifest(data);
  console.log(`  ${GREEN}✓${RESET} Provider ${GOLD}${id}${RESET} removed\n`);
}

export async function runProviderEnable(id: string): Promise<void> {
  if (!id) {
    console.log(`${RED}Usage: vestara provider enable <id>${RESET}\n`);
    return;
  }

  const data = await loadManifest();
  const p = findProvider(data, id);
  if (!p) {
    console.log(`  ${RED}Provider "${id}" not found.${RESET}\n`);
    return;
  }

  p.enabled = true;
  p.updatedAt = new Date().toISOString();
  await saveManifest(data);
  console.log(`  ${GREEN}✓${RESET} Provider ${GOLD}${id}${RESET} enabled\n`);
}

export async function runProviderDisable(id: string): Promise<void> {
  if (!id) {
    console.log(`${RED}Usage: vestara provider disable <id>${RESET}\n`);
    return;
  }

  const data = await loadManifest();
  const p = findProvider(data, id);
  if (!p) {
    console.log(`  ${RED}Provider "${id}" not found.${RESET}\n`);
    return;
  }

  p.enabled = false;
  p.updatedAt = new Date().toISOString();
  await saveManifest(data);
  console.log(`  ${GREEN}✓${RESET} Provider ${GOLD}${id}${RESET} disabled\n`);
}

export async function runProviderEnhancedList(): Promise<void> {
  const data = await loadManifest();
  const providers = getProviders(data);

  console.log();
  console.log(`${BOLD}${GOLD}Provider Registry${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────────────────${RESET}`);
  console.log();

  if (providers.length === 0) {
    console.log(`  ${GRAY}No providers configured.${RESET}`);
    console.log(`  ${GRAY}Add one with: vestara provider add <id> [--base-url <url>]${RESET}\n`);
    return;
  }

  for (const p of providers) {
    const icon = p.enabled ? `${GREEN}●${RESET}` : `${GRAY}○${RESET}`;
    const statusText = p.enabled ? `${GREEN}enabled${RESET}` : `${GRAY}disabled${RESET}`;
    const enabledModels = p.models.filter((m) => m.enabled).length;

    console.log(`  ${icon} ${BOLD}${p.id}${RESET}  ${GRAY}(${p.name})${RESET}`);
    console.log(`       Status:     ${statusText}`);
    if (p.baseUrl) console.log(`       Base URL:   ${GRAY}${p.baseUrl}${RESET}`);
    if (p.apiKeyEnv) console.log(`       API Key:    ${GRAY}\${${p.apiKeyEnv}}${RESET}`);
    console.log(`       Models:     ${enabledModels}/${p.models.length} enabled`);
    console.log(`       Created:    ${GRAY}${p.createdAt}${RESET}`);
    console.log();
  }
}

export async function runProviderModelsList(providerId: string): Promise<void> {
  if (!providerId) {
    console.log(`${RED}Usage: vestara provider models <provider-id>${RESET}\n`);
    return;
  }

  const data = await loadManifest();
  const p = findProvider(data, providerId);
  if (!p) {
    console.log(`  ${RED}Provider "${providerId}" not found.${RESET}\n`);
    return;
  }

  console.log();
  console.log(`${BOLD}${GOLD}Models for ${providerId}${RESET}`);
  console.log(`${GRAY}───────────────────────────────────────────────────────────────${RESET}`);
  console.log();

  if (p.models.length === 0) {
    console.log(`  ${GRAY}No models registered for "${providerId}".${RESET}`);
    console.log(`  ${GRAY}Add with: vestara provider model add ${providerId} <model-id>${RESET}\n`);
    return;
  }

  for (const m of p.models) {
    const icon = m.enabled ? `${GREEN}●${RESET}` : `${GRAY}○${RESET}`;
    const statusText = m.enabled ? `${GREEN}enabled${RESET}` : `${GRAY}disabled${RESET}`;
    const caps: string[] = [];
    if (m.capabilities.chat) caps.push('chat');
    if (m.capabilities.streaming) caps.push('stream');
    if (m.capabilities.functionCalling) caps.push('fn-call');
    if (m.capabilities.vision) caps.push('vision');

    console.log(`  ${icon} ${BOLD}${m.id}${RESET}`);
    console.log(`       Name:       ${m.name}`);
    console.log(`       Status:     ${statusText}`);
    console.log(`       Context:    ${(m.contextWindow / 1000).toFixed(0)}K`);
    console.log(`       Max Output: ${(m.maxOutput / 1000).toFixed(0)}K`);
    console.log(`       Caps:       ${caps.join(', ')}`);
    if (m.pricing) {
      console.log(
        `       Pricing:    $${m.pricing.inputPerMillionTokens}/M in, $${m.pricing.outputPerMillionTokens}/M out`,
      );
    }
    console.log();
  }
}

export async function runProviderModelAdd(providerId: string, modelId: string, modelArgs: string[]): Promise<void> {
  if (!providerId || !modelId) {
    console.log(
      `${RED}Usage: vestara provider model add <provider-id> <model-id> [--name <name>] [--context <N>] [--max-output <N>] [--capabilities <chat,stream,...>]${RESET}\n`,
    );
    return;
  }

  let name = modelId;
  let contextWindow = 128_000;
  let maxOutput = 8_192;
  let chat = true;
  let streaming = true;
  let fnCall = true;
  let vision = false;

  for (let i = 0; i < modelArgs.length; i++) {
    if (modelArgs[i] === '--name' && modelArgs[i + 1]) name = modelArgs[++i];
    else if (modelArgs[i] === '--context' && modelArgs[i + 1]) contextWindow = Number(modelArgs[++i]) || 128000;
    else if (modelArgs[i] === '--max-output' && modelArgs[i + 1]) maxOutput = Number(modelArgs[++i]) || 8192;
    else if (modelArgs[i] === '--capabilities' && modelArgs[i + 1]) {
      const caps = modelArgs[++i].split(',').map((c: string) => c.trim());
      chat = caps.includes('chat');
      streaming = caps.includes('stream');
      fnCall = caps.includes('fn-call') || caps.includes('function-calling');
      vision = caps.includes('vision');
    }
  }

  const data = await loadManifest();
  const p = findProvider(data, providerId);
  if (!p) {
    console.log(`  ${RED}Provider "${providerId}" not found.${RESET}\n`);
    return;
  }

  const existing = p.models.find((m) => m.id === modelId);
  if (existing) {
    existing.name = name;
    existing.contextWindow = contextWindow;
    existing.maxOutput = maxOutput;
    existing.capabilities = { chat, streaming, functionCalling: fnCall, vision };
    existing.enabled = true;
  } else {
    p.models.push({
      id: modelId,
      name,
      enabled: true,
      contextWindow,
      maxOutput,
      capabilities: { chat, streaming, functionCalling: fnCall, vision },
    });
  }

  p.updatedAt = new Date().toISOString();
  await saveManifest(data);
  console.log(`  ${GREEN}✓${RESET} Model ${GOLD}${modelId}${RESET} added to ${CYAN}${providerId}${RESET}\n`);
}

export async function runProviderModelEnable(providerId: string, modelId: string): Promise<void> {
  if (!providerId || !modelId) {
    console.log(`${RED}Usage: vestara provider model enable <provider-id> <model-id>${RESET}\n`);
    return;
  }

  const data = await loadManifest();
  const p = findProvider(data, providerId);
  if (!p) {
    console.log(`  ${RED}Provider "${providerId}" not found.${RESET}\n`);
    return;
  }

  const m = p.models.find((m) => m.id === modelId);
  if (!m) {
    console.log(`  ${RED}Model "${modelId}" not found for provider "${providerId}".${RESET}\n`);
    return;
  }

  m.enabled = true;
  p.updatedAt = new Date().toISOString();
  await saveManifest(data);
  console.log(`  ${GREEN}✓${RESET} Model ${GOLD}${modelId}${RESET} enabled for ${CYAN}${providerId}${RESET}\n`);
}

export async function runProviderModelDisable(providerId: string, modelId: string): Promise<void> {
  if (!providerId || !modelId) {
    console.log(`${RED}Usage: vestara provider model disable <provider-id> <model-id>${RESET}\n`);
    return;
  }

  const data = await loadManifest();
  const p = findProvider(data, providerId);
  if (!p) {
    console.log(`  ${RED}Provider "${providerId}" not found.${RESET}\n`);
    return;
  }

  const m = p.models.find((m) => m.id === modelId);
  if (!m) {
    console.log(`  ${RED}Model "${modelId}" not found for provider "${providerId}".${RESET}\n`);
    return;
  }

  m.enabled = false;
  p.updatedAt = new Date().toISOString();
  await saveManifest(data);
  console.log(`  ${GREEN}✓${RESET} Model ${GOLD}${modelId}${RESET} disabled for ${CYAN}${providerId}${RESET}\n`);
}
