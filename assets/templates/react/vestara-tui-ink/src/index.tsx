#!/usr/bin/env node
import { render } from 'ink';
import React from 'react';
import { App } from './App.js';

// Guard: no global config pollution per engineering rules
process.env.VESTARA_REPO = process.env.VESTARA_REPO || './data';

const args = process.argv.slice(2);
const providerFlag = args.find((a) => a.startsWith('--provider'))?.split('=')[1] || 'opencode';

console.log(
  `\x1b[36mVestara TUI\x1b[0m — provider=${providerFlag} repo=${process.env.VESTARA_REPO} — portable SSD, no auto-start daemons`,
);

render(<App />);

// Hotkeys from spec: Ctrl+P Search, Ctrl+R Provider/Model, ESC Recovery, E Extension Manager
process.on('SIGINT', () => process.exit(0));
