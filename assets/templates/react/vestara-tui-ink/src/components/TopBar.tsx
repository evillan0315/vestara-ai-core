import { Box, Text } from 'ink';
import React from 'react';
export function TopBar({ workspace, connected }: { workspace: string; connected: boolean }) {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
      height={1}
      borderStyle="single"
      borderBottom={true}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
    >
      <Box gap={1}>
        <Text color="#00E5FF" bold>
          V
        </Text>
        <Text color="white">Vestara</Text>
        <Text color="gray">{workspace}</Text>
      </Box>
      <Box gap={2}>
        <Text color={connected ? '#00FFA3' : 'yellow'}>{connected ? '● chat Connected' : '○ chat Disconnected'}</Text>
        <Text color="gray">Ctrl+P Search</Text>
        <Text color="gray">Ctrl+R Provider</Text>
      </Box>
    </Box>
  );
}
