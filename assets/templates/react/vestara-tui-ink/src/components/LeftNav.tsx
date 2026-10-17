import { Box, Text } from 'ink';
import React from 'react';

const items = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'sessions', icon: '⊙', label: 'Sessions' },
  { id: 'plans', icon: '□', label: 'Plans' },
  { id: 'graph', icon: '◇', label: 'Graph' },
  { id: 'execution', icon: '▶', label: 'Execution' },
  { id: 'workflow', icon: '⇄', label: 'Workflow' },
  { id: 'logs', icon: '≡', label: 'Logs' },
  { id: 'artifacts', icon: '■', label: 'Artifacts' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
];

export function LeftNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <Box
      flexDirection="column"
      width={22}
      borderStyle="single"
      borderRight={true}
      borderTop={false}
      borderBottom={false}
      borderLeft={false}
      paddingY={1}
    >
      {items.map((i) => (
        <Box key={i.id} paddingX={1}>
          <Text
            color={active === i.id ? '#00E5FF' : 'gray'}
            backgroundColor={active === i.id ? '#00E5FF15' : undefined}
            bold={active === i.id}
          >
            {active === i.id ? '▌ ' : '  '}
            {i.icon} {i.label}
          </Text>
        </Box>
      ))}
      <Box marginTop={2} paddingX={1} flexDirection="column">
        <Text color="gray" dimColor>
          Recent
        </Text>
        <Text color="#00E5FF">● eddie</Text>
        <Text color="gray" dimColor>
          Administrator
        </Text>
      </Box>
    </Box>
  );
}
