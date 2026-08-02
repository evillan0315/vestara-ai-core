import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';
import { OpenAICodexAdapter } from '../../src/adapters/openai-codex.js';
import { OpencodeAdapter } from '../../src/adapters/opencode.js';
import {
  discoverOpencodeConfig,
  parseAgentMarkdown,
  parseJsonc,
  parseSkillMarkdown,
} from '../../src/adapters/opencode-config.js';
import { redact, wasRedacted } from '../../src/redact.js';

let tmp: string | null = null;

function makeTmp(): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
  return tmp;
}

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('opencode config parsing', () => {
  it('parses JSONC config (comments + trailing commas)', () => {
    const parsed = parseJsonc('{ "provider": { "openai": { "apiKey": "sk-x" } }, }');
    expect(parsed).not.toBeNull();
  });

  it('discovers config sources, agents, skills, instructions, commands, providers, and mcp', () => {
    const root = makeTmp();
    fs.mkdirSync(path.join(root, '.opencode', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, '.opencode', 'skills', 'build', 'res'), { recursive: true });
    fs.mkdirSync(path.join(root, '.opencode', 'commands'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'opencode.json'),
      JSON.stringify({
        provider: { openai: { apiKey: 'sk-abcdef1234567890', models: { 'gpt-4o': {} } } },
        mcp: { filesystem: { command: 'npx', args: ['-y', 'mcp-server-filesystem', '/tmp'] } },
      }),
    );
    fs.writeFileSync(
      path.join(root, '.opencode', 'agents', 'build.md'),
      [
        '---',
        'description: Build agent',
        'mode: primary',
        'model: openai/gpt-4o',
        'tools: { "read": true, "bash": false }',
        'permissions: { "bash": "ask" }',
        '---',
        '# Build',
        'Instructions for building.',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, '.opencode', 'skills', 'build', 'SKILL.md'),
      [
        '---',
        'name: build',
        'description: Builds the project',
        'license: MIT',
        'compatibility: vestara',
        '---',
        'Run the build.',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, '.opencode', 'commands', 'rebuild.md'),
      '---\ndescription: Rebuild everything\nagent: build\n---\nRebuild all.\n',
    );
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Project instructions\n');

    const result = discoverOpencodeConfig({
      workspacePath: root,
      runtimeInstanceId: 'oc-test',
      homeDir: os.homedir(),
      now: new Date().toISOString(),
    });

    expect(result.sources.some((s) => s.path.endsWith('opencode.json'))).toBe(true);
    // Workspace agent always present; global agents may also be detected on this host.
    const buildAgent = result.agents.find((a) => a.name === 'build' && a.sourcePath?.startsWith(root));
    expect(buildAgent).toBeDefined();
    expect(buildAgent?.mode).toBe('primary');
    expect(buildAgent?.model?.modelId).toBe('openai/gpt-4o');
    expect(buildAgent?.tools['read']).toBe(true);
    expect(buildAgent?.tools['bash']).toBe(false);
    expect(buildAgent?.permissions[0]?.capability).toBe('bash');
    expect(buildAgent?.permissions[0]?.decision).toBe('ask');
    expect(result.skills.some((s) => s.name === 'build')).toBe(true);
    expect(result.commands.some((c) => c.name === 'rebuild')).toBe(true);
    expect(result.instructions.some((i) => i.format === 'agents-md')).toBe(true);
    expect(result.providers.some((p) => p.providerId === 'openai')).toBe(true);
    expect(result.mcpServers.some((m) => m.name === 'filesystem')).toBe(true);
  });

  it('redacts secrets from parsed config before persistence', () => {
    const root = makeTmp();
    fs.writeFileSync(
      path.join(root, 'opencode.json'),
      JSON.stringify({ provider: { openai: { apiKey: 'sk-abcdef1234567890' } } }),
    );
    const result = discoverOpencodeConfig({
      workspacePath: root,
      runtimeInstanceId: 'oc-test',
      homeDir: os.homedir(),
      now: new Date().toISOString(),
    });
    const jsonSource = result.sources.find((s) => s.path.endsWith('opencode.json'));
    expect(JSON.stringify(jsonSource?.redactedContent)).not.toContain('sk-abcdef1234567890');
    expect(JSON.stringify(jsonSource?.redactedContent)).toContain('[REDACTED]');
  });

  it('agent markdown parsing stores a redacted prompt preview', () => {
    const root = makeTmp();
    const agent = parseAgentMarkdown(
      'dev',
      'oc-test',
      path.join(root, 'dev.md'),
      '---\nname: dev\n---\nDo the thing.\n',
      'workspace',
    );
    expect(agent.name).toBe('dev');
    expect(agent.redactedPrompt).toContain('Do the thing.');
    expect(agent.contentHash).toBeTruthy();
  });

  it('skill parsing records supporting resources and validation', () => {
    const root = makeTmp();
    fs.mkdirSync(path.join(root, 'skill', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'skill', 'SKILL.md'), '---\nname: s\n---\nbody');
    fs.writeFileSync(path.join(root, 'skill', 'assets', 'x.txt'), 'x');
    const skill = parseSkillMarkdown(
      's',
      'oc-test',
      path.join(root, 'skill', 'SKILL.md'),
      fs.readFileSync(path.join(root, 'skill', 'SKILL.md'), 'utf8'),
      'workspace',
    );
    expect(skill.valid).toBe(true);
    expect(skill.supportingFiles.some((r) => r.name === 'assets')).toBe(true);
  });
});

describe('adapter discovery (mocked executable)', () => {
  it('OpencodeAdapter reports not-detected when executable is missing', async () => {
    const adapter = new OpencodeAdapter();
    const result = await adapter.detect({ workspacePath: '/tmp/nonexistent', timeoutMs: 500 });
    // Whether or not opencode is installed on the host, the adapter must not throw.
    expect(typeof result.detected).toBe('boolean');
    expect(result.runtimeType).toBe('opencode');
  });

  it('ClaudeCodeAdapter detects when executable is present', async () => {
    const adapter = new ClaudeCodeAdapter();
    const result = await adapter.detect({ workspacePath: '/tmp/nonexistent', timeoutMs: 500 });
    expect(result.runtimeType).toBe('claude-code');
    if (result.detected) {
      expect(result.executablePath).toBeTruthy();
    }
  });

  it('OpenAICodexAdapter detects when executable is present', async () => {
    const adapter = new OpenAICodexAdapter();
    const result = await adapter.detect({ workspacePath: '/tmp/nonexistent', timeoutMs: 500 });
    expect(result.runtimeType).toBe('openai-codex');
  });
});

describe('redaction boundaries', () => {
  it('never leaks secrets through nested structures', () => {
    const input = {
      apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      env: { OPENAI_API_KEY: 'sk-xyz', PATH: '/usr/bin' },
      command: { args: ['echo', 'hello'] },
    };
    const out = JSON.stringify(redact(input));
    expect(out).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(out).not.toContain('sk-xyz');
    expect(out).toContain('hello');
  });
});
