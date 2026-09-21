import { describe, expect, it } from 'vitest';
import { avoidWorkspaceCodexHome, createCodexSdkEnv } from '../src/assistant-codex-adapter';

describe('Assistant Codex adapter environment', () => {
  it('keeps generic OPENAI_MODEL out of the Codex SDK environment', () => {
    const env = createCodexSdkEnv({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-4o',
      VESTARA_CODEX_MODEL: 'gpt-5.5',
    });

    expect(env.OPENAI_API_KEY).toBe('sk-test');
    expect(env.VESTARA_CODEX_MODEL).toBe('gpt-5.5');
    expect(env).not.toHaveProperty('OPENAI_MODEL');
  });

  it('resolves the Node --env-file literal GPT4ALL placeholder for OpenAI auth', () => {
    const env = createCodexSdkEnv({
      OPENAI_API_KEY: '${GPT4ALL_API_KEY}',
      GPT4ALL_API_KEY: 'sk-from-gpt4all',
    });

    expect(env.OPENAI_API_KEY).toBe('sk-from-gpt4all');
  });

  it('does not pass a workspace-root CODEX_HOME into Codex subprocesses', () => {
    const env = avoidWorkspaceCodexHome(
      {
        CODEX_HOME: '/repo/project',
        OPENAI_API_KEY: 'sk-test',
      },
      '/repo/project',
    );

    expect(env.OPENAI_API_KEY).toBe('sk-test');
    expect(env).not.toHaveProperty('CODEX_HOME');
  });

  it('preserves CODEX_HOME when it points outside the workspace', () => {
    const env = avoidWorkspaceCodexHome(
      {
        CODEX_HOME: '/home/user/.codex',
        OPENAI_API_KEY: 'sk-test',
      },
      '/repo/project',
    );

    expect(env.CODEX_HOME).toBe('/home/user/.codex');
  });
});
