import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext, url: URL, port: number) => Promise<boolean>;

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Vestara-Actor',
};

export function json(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...CORS });
  res.end(data);
}

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function actorOf(req: http.IncomingMessage): string {
  const h = req.headers['x-vestara-actor'];
  return typeof h === 'string' && h.trim() ? h.trim() : 'local-operator';
}

export function getActor(req: http.IncomingMessage, ctx: WorkspaceContext) {
  const { authenticate } = require('../auth');
  return authenticate(req, ctx.users);
}
