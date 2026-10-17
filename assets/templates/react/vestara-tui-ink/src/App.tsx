import { Box } from 'ink';
import React, { useState } from 'react';
import { ChatView } from './components/ChatView.js';
import { InputBar } from './components/InputBar.js';
import { LeftNav } from './components/LeftNav.js';
import { RightInspector } from './components/RightInspector.js';
import { TopBar } from './components/TopBar.js';
import { useVestaraSocket } from './hooks/useVestaraSocket.js';

export function App() {
  const [active, setActive] = useState('chat');
  const { connected, messages, send, contextFiles } = useVestaraSocket('vestara-ai-core');

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TopBar workspace="vestara-ai-core" connected={connected} />
      <Box flexDirection="row" flexGrow={1}>
        <LeftNav active={active} onSelect={setActive} />
        <Box flexDirection="column" flexGrow={1}>
          <ChatView messages={messages} />
        </Box>
        <RightInspector connected={connected} contextFiles={contextFiles} />
      </Box>
      <InputBar onSend={send} />
    </Box>
  );
}
