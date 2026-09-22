import { describe, expect, it } from 'vitest';
import {
  avoidWorkspaceCodexHome,
  createCodexSdkEnv,
  createCodexSdkOptions,
  createCodexToolPartEvent,
} from '../src/assistant-codex-adapter';

describe('Assistant Codex adapter environment', () => {
  it('keeps generic OPENAI_MODEL out of the Codex SDK environment', () => {
    const env = createCodexSdkEnv({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'gpt-4o',
      VESTARA_CODEX_MODEL: 'gpt-5.5',
    });

    expect(env.VESTARA_CODEX_MODEL).toBe('gpt-5.5');
    expect(env).not.toHaveProperty('OPENAI_MODEL');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('does not pass generic OpenAI auth placeholders into Codex', () => {
    const env = createCodexSdkEnv({
      OPENAI_API_KEY: '${GPT4ALL_API_KEY}',
      GPT4ALL_API_KEY: 'sk-from-gpt4all',
    });

    expect(env).not.toHaveProperty('OPENAI_API_KEY');
    expect(env.GPT4ALL_API_KEY).toBe('sk-from-gpt4all');
  });

  it('does not pass a workspace-root CODEX_HOME into Codex subprocesses', () => {
    const env = avoidWorkspaceCodexHome(
      {
        CODEX_HOME: '/repo/project',
        OPENAI_API_KEY: 'sk-test',
      },
      '/repo/project',
    );

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

  it('does not use a generic OpenAI key as the Codex SDK apiKey', () => {
    const options = createCodexSdkOptions(
      {
        OPENAI_API_KEY: 'sk-openai',
        OPENAI_MODEL: 'gpt-4o',
      },
      '/repo/project',
    );

    expect(options?.apiKey).toBeUndefined();
    expect(options?.env).not.toHaveProperty('OPENAI_MODEL');
    expect(options?.env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('passes CODEX_API_KEY as the Codex SDK apiKey when present', () => {
    const options = createCodexSdkOptions(
      {
        CODEX_API_KEY: 'sk-codex',
        OPENAI_API_KEY: 'sk-openai',
      },
      '/repo/project',
    );

    expect(options?.apiKey).toBe('sk-codex');
  });

  it('mirrors Codex command lifecycle using the canonical tool-part shape', () => {
    const event = createCodexToolPartEvent({
      status: 'running',
      callID: 'cmd-123',
      tool: 'bash',
      agentId: 'vestara-developer',
      conversationId: 'conv-codex',
      sessionId: 'codex:thread-1',
    });

    expect(event).toMatchObject({
      type: 'codex.message.part.updated',
      source: 'assistant-codex-adapter',
      actor: { id: 'vestara-developer', role: 'agent' },
      payload: {
        part: { type: 'tool', callID: 'cmd-123', tool: 'bash', state: { status: 'running' } },
        conversationId: 'conv-codex',
        sessionId: 'codex:thread-1',
        runtime: 'codex',
        provider: 'openai-codex',
      },
      metadata: { correlationId: 'conv-codex' },
    });
  });
});
