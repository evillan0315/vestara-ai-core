/**
 * @vestara/onboarding-lab — Developer test rig for v4.5 Workspace Runtime.
 *
 * Tests the full stack: kernel, workspace runtime, project detection,
 * Ollama provider, filesystem tools, git integration, context assembly,
 * and tool calling.
 *
 * Architecture Traceability:
 *   PCS-020 → Developer Test Rig
 *   UX-011 → Onboarding Lab
 *
 * Usage:
 *   node apps/onboarding-lab/dist/index.js
 */

import * as path from 'node:path';
import {
  DefaultMicrophoneProvider,
  DefaultSpeakerProvider,
  SileroVADProvider,
  VestaraAudioService,
} from '@vestara/audio';
import { DefaultConversationService } from '@vestara/conversation';
import { OllamaProvider, ProviderRouter } from '@vestara/conversation-runtime';
import { DefaultKernel } from '@vestara/kernel';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager } from '@vestara/provider-runtime';
import { VestaraSTTService, WhisperSTTProvider } from '@vestara/stt';
import { PiperTTSProvider, VestaraTTSService } from '@vestara/tts';
import { WorkspaceRuntimeService, WorkspaceToolProvider } from '@vestara/workspace';

const GOLD = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GRAY = '\x1b[90m';

const GAUGE_EMPTY = '\u2591';
const GAUGE_FULL = '\u2588';

function gauge(val: number, max: number, width = 50): string {
  const filled = Math.round((val / max) * width);
  return GAUGE_FULL.repeat(filled) + GAUGE_EMPTY.repeat(Math.max(0, width - filled));
}

function step(label: string, ok: boolean, detail?: string): void {
  const icon = ok ? `${GREEN}\u2713${RESET}` : `${RED}\u2717${RESET}`;
  const detailStr = detail ? `  ${GRAY}${detail}${RESET}` : '';
  console.log(`  ${icon} ${label}${detailStr}`);
}

function header(title: string): void {
  console.log();
  console.log(`  ${BOLD}${title}${RESET}`);
  console.log(`  ${GRAY}\u2500'.repeat(55)}${RESET}`);
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  const wsPath = args[0] && args[0] !== '--all' ? args[0] : process.cwd();

  console.log();
  console.log(`${BOLD}${GOLD}Vestara Onboarding Lab v4.5${RESET}`);
  console.log(`${GRAY}Workspace Runtime Integration Test Rig${RESET}`);
  console.log(`${GRAY}\u2500'.repeat(55)}${RESET}`);
  console.log();

  if (runAll || args.includes('--all')) {
    const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

    const wsResult = await testWorkspaceRuntime(wsPath);
    results.push(wsResult);
    const providerResult = await testProviders();
    results.push(providerResult);
    const convResult = await testConversation();
    results.push(convResult);
    const fsResult = await testFilesystem(wsPath);
    results.push(fsResult);
    const gitResult = await testGit(wsPath);
    results.push(gitResult);
    const audioResult = await testAudio();
    results.push(audioResult);
    const toolsResult = await testTools(wsPath);
    results.push(toolsResult);
    const contextResult = await testContext(wsPath);
    results.push(contextResult);

    header('Summary');
    let okCount = 0;
    for (const r of results) {
      step(r.name, r.ok, r.detail);
      if (r.ok) okCount++;
    }
    const pct = Math.round((okCount / results.length) * 100);
    console.log();
    console.log(`  ${GRAY}Overall: ${gauge(pct, 100)} ${pct}% (${okCount}/${results.length})${RESET}`);
    console.log();
  }

  if (runAll) {
    console.log(`${GREEN}Lab complete.${RESET}`);
    console.log();
  }
}

async function testWorkspaceRuntime(cwd: string): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Workspace Runtime');
  try {
    const runtime = new WorkspaceRuntimeService({
      id: 'lab-workspace' as any,
      type: 'workspace' as any,
      name: 'Lab Workspace Runtime',
      rootDir: cwd,
    });
    await runtime.initialize();

    const profile = runtime.profile;
    const health = runtime.getRuntimeHealth();
    step('Project detected', true, profile.name);
    step('Language detected', true, profile.primaryLanguage.name);
    step('Files indexed', true, `${health.indexedFiles} files, ${health.indexedDirectories} dirs`);

    if (profile.frameworks.length > 0) {
      step('Frameworks detected', true, profile.frameworks.map((f: any) => f.name).join(', '));
    } else {
      step('Frameworks', false, 'none detected');
    }
    step('Package manager', !!profile.packageManager, profile.packageManager?.name);
    step('Monorepo', true, profile.isMonorepo ? 'yes' : 'no');
    if (profile.apps.length > 0) step('Apps found', true, profile.apps.join(', '));
    if (profile.packages.length > 0) step('Packages found', true, profile.packages.join(', '));
    step('Git repository', health.isGitRepository);

    await runtime.stop();
    await runtime.destroy();

    return { name: 'Workspace Runtime', ok: true, detail: `${profile.name} (${profile.primaryLanguage.name})` };
  } catch (err: any) {
    return { name: 'Workspace Runtime', ok: false, detail: err.message };
  }
}

async function testProviders(): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('AI Providers');
  try {
    const pm = new DefaultProviderManager();
    const ocp = new OpenCodeProvider();
    await pm.register(ocp);
    await ocp.initialize({});
    step('OpenCode registered', true, ocp.models[0]?.id ?? 'unknown');

    const ollamaProvider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434', defaultModel: 'deepseek-coder' });
    await ollamaProvider.health();
    step('Ollama', ollamaProvider.available, ollamaProvider.available ? ollamaProvider.model : 'not detected');

    const router = new ProviderRouter();
    router.registerOffline(ollamaProvider);
    const routerStatus = await router.getStatus();
    step('Router status', true, `active: ${routerStatus.active?.providerId ?? 'none'}`);

    return {
      name: 'AI Providers',
      ok: true,
      detail: `OpenCode + ${ollamaProvider.available ? ollamaProvider.model : 'Ollama(offline)'}`,
    };
  } catch (err: any) {
    return { name: 'AI Providers', ok: false, detail: err.message };
  }
}

async function testConversation(): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Conversation Stack');
  try {
    const ocp = new OpenCodeProvider();
    await ocp.initialize({});
    const router = new ProviderRouter();
    const { OpenCodeCloudProvider } = await import('@vestara/conversation-runtime');
    router.registerOnline(new OpenCodeCloudProvider(ocp));
    router.registerOffline(new OllamaProvider({ defaultModel: 'deepseek-coder' }));

    const { DefaultContextAssembler } = await import('@vestara/context');
    const ctx = new DefaultContextAssembler('You are Vestara lab.');
    const convSvc = new DefaultConversationService({ contextAssembler: ctx, providerExecutor: router });
    const conv = await convSvc.createConversation('lab-user');
    step('Conversation created', true, conv.id);

    const profileStore = (await import('@vestara/conversation-runtime')).SqliteUserProfileStore;
    const store = new profileStore();
    await store.initialize();
    const profile = await store.load();
    step('User profile', !!profile, profile ? `${profile.name ?? 'Unnamed'} (${profile.role ?? 'no role'})` : 'not set');

    return { name: 'Conversation Stack', ok: true, detail: `conv=${conv.id}` };
  } catch (err: any) {
    return { name: 'Conversation Stack', ok: false, detail: err.message };
  }
}

async function testFilesystem(cwd: string): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Filesystem Tools');
  try {
    const runtime = new WorkspaceRuntimeService({
      id: 'lab-fs' as any,
      type: 'workspace' as any,
      name: 'Lab FS',
      rootDir: cwd,
    });
    await runtime.initialize();

    const fs = runtime.filesystem;
    const pwd = fs.pwd();
    step('pwd', true, pwd);

    const entries = fs.ls('.');
    step('ls', entries.length > 0, `${entries.length} entries`);

    const exists = fs.exists('package.json');
    step('package.json exists', exists);

    if (exists) {
      const content = fs.readFile('package.json');
      step('read package.json', true, `${content.size} bytes`);
    }

    const globResults = fs.glob('*.json');
    step('glob *.json', globResults.length > 0, `${globResults.length} files`);

    const stat = fs.stat('package.json');
    step('stat package.json', true, `${stat.size} bytes, modified ${stat.modifiedAt.slice(0, 10)}`);

    const tree = fs.tree('.', 1);
    step('tree depth=1', tree.length > 0, `${tree.length} top-level entries`);

    await runtime.stop();
    await runtime.destroy();

    return { name: 'Filesystem Tools', ok: true, detail: `${entries.length} entries, ${globResults.length} JSON files` };
  } catch (err: any) {
    return { name: 'Filesystem Tools', ok: false, detail: err.message };
  }
}

async function testGit(cwd: string): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Git Integration');
  try {
    const { GitService } = await import('@vestara/workspace');
    const git = new GitService(cwd);

    if (!git.isRepository) {
      step('Git repo', false, 'not a git repository');
      return { name: 'Git Integration', ok: true, detail: 'not a git repo (ok)' };
    }

    step('Git root', true, git.root ?? '');
    const branch = git.branch();
    step('Branch', !!branch, branch ?? '');
    const status = git.status();
    step('Status', !!status, status ? `${status.entries.length} changes` : 'clean');

    if (status && status.entries.length > 0) {
      const staged = status.entries.filter((e: any) => e.staged);
      const unstaged = status.entries.filter((e: any) => !e.staged && e.status !== 'untracked');
      if (staged.length > 0) step('Staged changes', true, `${staged.length} files`);
      if (unstaged.length > 0) step('Unstaged changes', true, `${unstaged.length} files`);
    }

    const log = git.log({ maxCount: 3 });
    step('Git log', log.length > 0, log.length > 0 ? `${log.length} commits` : 'no commits');

    return { name: 'Git Integration', ok: true, detail: branch ?? 'detached' };
  } catch (err: any) {
    return { name: 'Git Integration', ok: false, detail: err.message };
  }
}

async function testAudio(): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Audio Pipeline');
  try {
    const audio = new VestaraAudioService();
    audio.registerMicrophone(new DefaultMicrophoneProvider());
    audio.registerSpeaker(new DefaultSpeakerProvider());
    audio.registerVAD(new SileroVADProvider());
    const diag = await audio.diagnose();

    step('Microphone', diag.microphone.available, `${diag.microphone.latency}ms`);
    step('Speakers', diag.speakers.available, `${diag.speakers.latency}ms`);
    step('VAD', diag.vad.status !== 'error', diag.vad.provider);

    const stt = new VestaraSTTService();
    stt.registerProvider(new WhisperSTTProvider());
    const sttHealth = await stt.healthCheck();
    step('STT', sttHealth.status === 'healthy');

    const tts = new VestaraTTSService();
    tts.registerProvider(new PiperTTSProvider());
    const ttsHealth = await tts.healthCheck();
    step('TTS', ttsHealth.status === 'healthy');

    return {
      name: 'Audio Pipeline',
      ok: diag.microphone.available || diag.speakers.available,
      detail: `mic=${diag.microphone.available}, spk=${diag.speakers.available}`,
    };
  } catch (err: any) {
    return { name: 'Audio Pipeline', ok: false, detail: err.message };
  }
}

async function testTools(cwd: string): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Tool Calling');
  try {
    const runtime = new WorkspaceRuntimeService({
      id: 'lab-tools' as any,
      type: 'workspace' as any,
      name: 'Lab Tools',
      rootDir: cwd,
    });
    await runtime.initialize();

    const tools = runtime.getAllTools();
    step('Tool count', tools.length > 0, `${tools.length} tools registered`);

    const toolIds = tools.map((t: any) => t.definition.id);
    const expected = ['workspace.pwd', 'workspace.readFile', 'workspace.ls', 'workspace.glob', 'workspace.gitStatus'];
    for (const id of expected) {
      step(`\u2514 ${id}`, toolIds.includes(id));
    }

    await runtime.stop();
    await runtime.destroy();

    return { name: 'Tool Calling', ok: true, detail: `${tools.length} tools (${expected.length} core)` };
  } catch (err: any) {
    return { name: 'Tool Calling', ok: false, detail: err.message };
  }
}

async function testContext(cwd: string): Promise<{ name: string; ok: boolean; detail?: string }> {
  header('Context Assembly');
  try {
    const runtime = new WorkspaceRuntimeService({
      id: 'lab-ctx' as any,
      type: 'workspace' as any,
      name: 'Lab Context',
      rootDir: cwd,
    });
    await runtime.initialize();

    const contextProvider = runtime.contextProvider;
    const systemPrompt = contextProvider.buildSystemPrompt();

    step('System prompt generated', true, `${systemPrompt.length} chars`);
    step('Contains project name', systemPrompt.includes(runtime.profile.name));
    step('Contains language', systemPrompt.includes(runtime.profile.primaryLanguage.name));
    step('Contains rules', systemPrompt.includes('Do not guess') || systemPrompt.includes('Never fabricate'));
    step('Contains workspace context', systemPrompt.includes('<workspace_context>'));

    await runtime.stop();
    await runtime.destroy();

    return { name: 'Context Assembly', ok: true, detail: `${systemPrompt.length} chars` };
  } catch (err: any) {
    return { name: 'Context Assembly', ok: false, detail: err.message };
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal:${RESET}`, err.message);
  process.exit(1);
});
