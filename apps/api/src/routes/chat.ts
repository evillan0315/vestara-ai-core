import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody, CORS } from './types';

export async function handleChatRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'POST' && p === '/api/chat/send') {
    const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {}; const message = body.message?.trim();
    if (!message) { json(res, 400, { error: 'message is required' }); return true; }
    const session = ctx.runtime.getSession(); const profile = session.profile;
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    if (!provider) { json(res, 503, { error: 'AI provider not available' }); return true; }
    const systemPrompt = ['You are Vestara, an AI engineering assistant.', `Workspace: ${profile.name}`, `Language: ${profile.language}`, `Framework: ${profile.framework || '(none)'}`, `Files: ${profile.fileCount}`, `Packages: ${profile.packageCount}`, 'Keep responses concise and actionable.'].join('\n');
    const result = await provider.complete({ model: body.model || 'nemotron-3-ultra-free', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }], temperature: 0.5, maxTokens: 2048 });
    json(res, 200, { response: result.content || 'No response.' });
    return true;
  }

  if (method === 'POST' && p === '/api/chat/stream') {
    const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {}; const message = body.message?.trim();
    if (!message) { json(res, 400, { error: 'message is required' }); return true; }
    const session = ctx.runtime.getSession(); const profile = session.profile;
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    if (!provider?.stream) { json(res, 503, { error: 'streaming not available' }); return true; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS });
    const systemPrompt = ['You are Vestara, an AI engineering assistant.', `Workspace: ${profile.name}`, `Language: ${profile.language}`, `Framework: ${profile.framework || '(none)'}`, `Files: ${profile.fileCount}`, `Packages: ${profile.packageCount}`, 'Keep responses concise and actionable.'].join('\n');
    try {
      const stream = provider.stream({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }], model: body.model || 'nemotron-3-ultra-free' });
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.content) res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
        if (chunk.type === 'complete') res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    } catch (err: any) { res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`); }
    finally { res.end(); }
    return true;
  }

  return false;
}
