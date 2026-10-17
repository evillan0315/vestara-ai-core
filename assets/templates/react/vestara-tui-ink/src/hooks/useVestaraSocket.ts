import { useEffect, useRef, useState } from 'react';
import WebSocket from 'ws';
import type { Message } from '../types.js';

export function useVestaraSocket(workspaceId: string) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'user', content: 'hello', timestamp: new Date().toISOString() },
    {
      id: '2',
      role: 'assistant',
      content:
        "Hello! I'm the Vestara Assistant — how can I help you with your workspace today?\n\nI can explain project activity, workflow state, or help you dig into the repo.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [contextFiles, setContextFiles] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Provider-agnostic: tries local API first, falls back to mock when offline (per spec)
    const url = process.env.VESTARA_WS || 'ws://localhost:8080/ws/conversation';
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.on('open', () => setConnected(true));
      ws.on('close', () => setConnected(false));
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'chunk') {
            setMessages((m) => {
              const last = m[m.length - 1];
              if (last?.role === 'assistant')
                return [...m.slice(0, -1), { ...last, content: last.content + msg.content }];
              return [
                ...m,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: msg.content,
                  timestamp: new Date().toISOString(),
                },
              ];
            });
          }
        } catch {}
      });
      ws.on('error', () => setConnected(false));
      return () => ws.close();
    } catch {
      setConnected(false);
    }
  }, [workspaceId]);

  const send = (content: string) => {
    const msg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: new Date().toISOString() };
    setMessages((m) => [...m, msg]);
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ workspaceId, content, role: 'software-architect' }));
    } else {
      // Offline mock — per screenshot gap: offline fails cleanly
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Routed to software-architect via local: ${content.slice(0, 120)} (offline mock — start API with VESTARA_REPO=./data)`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }, 400);
    }
  };

  return { connected, messages, send, contextFiles, setContextFiles };
}
