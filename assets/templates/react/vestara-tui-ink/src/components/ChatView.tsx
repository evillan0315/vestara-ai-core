import { Box, Text } from 'ink';
import React from 'react';
import type { Message } from '../types.js';

export function ChatView({ messages }: { messages: Message[] }) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1} gap={1}>
      {messages.map((m) => (
        <Box key={m.id} flexDirection="column">
          <Text color={m.role === 'user' ? '#D4A574' : '#00E5FF'} bold>
            {m.role}:{' '}
          </Text>
          <Text color={m.role === 'user' ? 'gray' : 'white'}>{m.content}</Text>
        </Box>
      ))}
    </Box>
  );
}
