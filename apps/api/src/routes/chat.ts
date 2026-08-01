import type * as http from 'node:http';
import type { EngineeringAgentRole } from '@vestara/provider-runtime';
import type { WorkspaceContext } from '../workspace-context';
import { CORS, json, readBody } from './types';

export async function handleChatRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'POST' && p === '/api/chat/send') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const message = body.message?.trim();
    if (!message) {
      json(res, 400, { error: 'message is required' });
      return true;
    }
    const session = ctx.runtime.getSession();
    const profile = session.profile;
    const route = await resolveChatRoute(ctx, body.agentId, body.role, body.model);
    const provider = ctx.kernel.providerManager?.getProvider(route.providerId) ?? null;
    if (!provider) {
      json(res, 503, { error: `AI provider not available: ${route.providerId}` });
      return true;
    }
    const systemPrompt = [
      'You are Vestara, an AI engineering assistant.',
      `Workspace: ${profile.name}`,
      `Language: ${profile.language}`,
      `Framework: ${profile.framework || '(none)'}`,
      `Files: ${profile.fileCount}`,
      `Packages: ${profile.packageCount}`,
      route.agentName ? `Active agent: ${route.agentName} (${route.role})` : '',
      'Keep responses concise and actionable.',
    ]
      .filter(Boolean)
      .join('\n');
    const result = await provider.complete({
      model: route.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.5,
      maxTokens: 2048,
    });
    json(res, 200, { response: result.content || 'No response.' });
    return true;
  }

  if (method === 'POST' && p === '/api/chat/stream') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const message = body.message?.trim();
    if (!message) {
      json(res, 400, { error: 'message is required' });
      return true;
    }
    const session = ctx.runtime.getSession();
    const profile = session.profile;
    const route = await resolveChatRoute(ctx, body.agentId, body.role, body.model);
    const provider = ctx.kernel.providerManager?.getProvider(route.providerId) ?? null;
    if (!provider?.stream) {
      json(res, 503, { error: `Streaming not available: ${route.providerId}` });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS,
    });
    const systemPrompt = [
      'You are Vestara, an AI engineering assistant.',
      `Workspace: ${profile.name}`,
      `Language: ${profile.language}`,
      `Framework: ${profile.framework || '(none)'}`,
      `Files: ${profile.fileCount}`,
      `Packages: ${profile.packageCount}`,
      route.agentName ? `Active agent: ${route.agentName} (${route.role})` : '',
      'Keep responses concise and actionable.',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const stream = provider.stream({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        model: route.modelId,
      });
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.content)
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
        if (chunk.type === 'complete') res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    } finally {
      res.end();
    }
    return true;
  }

  return false;
}

async function resolveChatRoute(
  ctx: WorkspaceContext,
  agentId: unknown,
  requestedRole: unknown,
  requestedModel: unknown,
) {
  if (typeof agentId !== 'string' && typeof requestedRole !== 'string') {
    return {
      agentName: undefined,
      role: 'assistant',
      providerId: 'opencode',
      modelId: typeof requestedModel === 'string' && requestedModel ? requestedModel : 'nemotron-3-ultra-free',
    };
  }
  const selection = ctx.routingStore.get().selection;
  const agent = typeof agentId === 'string' ? await ctx.agents.getAgent(agentId) : null;
  const normalizedAgentRole =
    agent?.role === 'documenter' ? 'documentation' : agent?.role === 'planning' ? 'planner' : agent?.role;
  const selectableRoles: readonly EngineeringAgentRole[] = [
    'planner',
    'architect',
    'developer',
    'reviewer',
    'verifier',
    'documentation',
  ];
  const requestedRoutingRole =
    typeof requestedRole === 'string' && selectableRoles.includes(requestedRole as EngineeringAgentRole)
      ? (requestedRole as EngineeringAgentRole)
      : undefined;
  const role =
    requestedRoutingRole && requestedRoutingRole === normalizedAgentRole && selection.roles[requestedRoutingRole]
      ? requestedRoutingRole
      : selection.roles.developer
        ? 'developer'
        : Object.keys(selection.roles)[0];
  const selected = role ? selection.roles[role as EngineeringAgentRole] : undefined;
  return {
    agentName: agent?.name,
    role: role ?? 'assistant',
    providerId: selected?.providerId ?? 'opencode',
    modelId: selected?.modelId ?? 'nemotron-3-ultra-free',
  };
}
