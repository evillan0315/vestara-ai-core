export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  parentId?: string;
  toolCalls?: ToolCall[];
}

export interface Model {
  id: string;
  name: string;
  provider?: string;
}

export interface ConversationData {
  id: string;
  title: string;
  branches: Record<string, ChatMessage[]>;
  activeBranch: string;
  timestamp: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size?: number;
  url?: string;
  thumbnail?: string;
  progress?: number;
  error?: string;
}

export type MessageStatus = 'pending' | 'streaming' | 'completed' | 'error';

export interface StreamingState {
  text: string;
  status: MessageStatus;
}

export interface ToolCall {
  id: string;
  tool: string;
  args?: string;
  status: 'running' | 'completed' | 'error';
  label: string;
  output?: string;
  error?: string;
  timestamp: number;
}
