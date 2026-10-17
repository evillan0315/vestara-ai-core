import { z } from 'zod';
export const AssistantRoleSchema = z.enum([
  'software-architect',
  'backend-engineer',
  'frontend-engineer',
  'ai-engineer',
  'devops-engineer',
  'security-engineer',
  'qa-engineer',
  'documentation-engineer',
  'research-agent',
  'product-manager',
  'chief-architect',
]);
export type AssistantRole = z.infer<typeof AssistantRoleSchema>;
export const ProviderSchema = z.enum(['opencode', 'ollama', 'openai', 'anthropic', 'local']);
export type Provider = z.infer<typeof ProviderSchema>;
export const MemoryEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  kind: z.enum(['decision', 'knowledge', 'preference', 'artifact', 'conversation']),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  verified: z.boolean().default(false),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  provider: ProviderSchema.optional(),
  roleAssumed: AssistantRoleSchema.optional(),
  timestamp: z.string(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
