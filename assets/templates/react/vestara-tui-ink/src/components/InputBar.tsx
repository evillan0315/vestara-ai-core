import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

export function InputBar({ onSend }: { onSend: (msg: string) => void }) {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      if (value.trim()) {
        onSend(value);
        setValue('');
      }
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
  });

  return (
    <Box
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      height={3}
    >
      <Box gap={1}>
        <Text color="#00E5FF" bold>
          {'>'}
        </Text>
        <Text color={value ? 'white' : 'gray'}>{value || 'Type your message or / for commands...'}</Text>
        <Text color="gray" dimColor>
          {value.startsWith('/') ? '  (commands: /add, /model, /clear, /export)' : ''}
        </Text>
      </Box>
      <Box marginLeft="auto">
        <Text color="gray">Enter ↵ Send</Text>
      </Box>
    </Box>
  );
}
