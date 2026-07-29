import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';

const THEME = {
  background: '#09090b',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#09090b',
  selectionBackground: '#3f3f46',
  black: '#09090b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#a78bfa',
  cyan: '#22d3ee',
  white: '#e4e4e7',
};

const _termMap = (window as any).__terminalMap || new Map<string, Terminal>();
if (!(window as any).__terminalMap) (window as any).__terminalMap = _termMap;

export function writeToTerminal(id: string, data: string) {
  _termMap.get(id)?.write(data);
}

export function writelnToTerminal(id: string, data: string) {
  _termMap.get(id)?.writeln(data);
}

export function clearTerminal(id: string) {
  _termMap.get(id)?.clear();
}

interface TerminalPaneProps {
  sessionId: string;
  onData: (data: string) => void;
}

export function TerminalPane({ sessionId, onData }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      cols: 80,
      rows: 24,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineHeight: 1.35,
      theme: THEME,
    });
    _termMap.set(sessionId, term);

    el.innerHTML = '';
    const xtermEl = document.createElement('div');
    xtermEl.style.width = '100%';
    xtermEl.style.height = '100%';
    el.appendChild(xtermEl);
    term.open(xtermEl);

    term.writeln('Vestara Terminal ready.');
    term.write('$ ');

    term.onData((data) => {
      onDataRef.current(data);
      for (const ch of data) {
        if (ch === '\x7f') {
          term.write('\b \b');
        } else if (ch >= ' ') {
          term.write(ch);
        }
      }
    });

    const ta = el.querySelector<HTMLTextAreaElement>('textarea');
    if (ta) {
      ta.style.position = 'absolute';
      ta.style.left = '0';
      ta.style.top = '0';
      ta.style.width = '1px';
      ta.style.height = '1px';
      ta.style.opacity = '0';
      ta.focus();
    }

    const focusTerm = () => {
      term.focus();
      const t = el.querySelector<HTMLTextAreaElement>('textarea');
      if (t) t.focus();
    };

    requestAnimationFrame(focusTerm);
    const t1 = setTimeout(focusTerm, 100);
    const t2 = setTimeout(focusTerm, 500);
    el.addEventListener('mousedown', focusTerm);
    el.addEventListener('click', focusTerm);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      el.removeEventListener('mousedown', focusTerm);
      el.removeEventListener('click', focusTerm);
      _termMap.delete(sessionId);
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-0" style={{ background: '#09090b', outline: 'none' }} />
  );
}
