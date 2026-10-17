import { z } from 'zod';
export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;
export type AgentRole = 'Verifier' | 'Architect' | 'Builder' | 'Explorer';
export type Tool = { name: 'Filesystem' | 'Terminal' | 'Git'; available: boolean };
