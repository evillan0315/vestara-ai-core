import { Box, Text } from 'ink';
import React from 'react';

export function RightInspector({ connected, contextFiles }: { connected: boolean; contextFiles: number }) {
  return (
    <Box
      flexDirection="column"
      width={32}
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      paddingX={1}
      gap={1}
    >
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Session
        </Text>
        <Text color="white">New session</Text>
        <Text color="gray" dimColor>
          Ready
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Context
        </Text>
        <Text color="white">{contextFiles} files in context</Text>
        <Text color="gray" dimColor>
          Usage available after execution
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Agent
        </Text>
        <Text color="white">Verifier</Text>
        <Text color="#00FFA3">● active</Text>
      </Box>
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Model
        </Text>
        <Text color={connected ? 'white' : 'yellow'}>{connected ? 'opencode (local)' : 'Not selected'}</Text>
        <Text color="gray" dimColor>
          {connected ? 'Provider-agnostic core' : 'No provider route'}
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Files
        </Text>
        <Text color="gray" dimColor>
          Drop or /add to include
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Tools
        </Text>
        <Text color="#00FFA3">● Filesystem</Text>
        <Text color="#00FFA3">● Terminal</Text>
        <Text color="#00FFA3">● Git</Text>
      </Box>
      <Box flexDirection="column">
        <Text color="#D4A574" bold>
          Quick Actions
        </Text>
        <Text color="white">Ctrl+P Search</Text>
        <Text color="white">Ctrl+R Provider / Model</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="#00FFA3" bold>
          {connected ? 'Runtime connected' : 'Runtime offline — mock'}
        </Text>
      </Box>
    </Box>
  );
}
