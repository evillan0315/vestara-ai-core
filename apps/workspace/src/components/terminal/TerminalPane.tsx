import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useVestaraTheme } from '@vestara/ui-theme';

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
  /** Identifier for the terminal session. */
  sessionId?: string;
  /** Callback when terminal data is received. */
  onData?: (data: string) => boolean | void;
  /** Fired after fit with the display dimensions (recorded server-side). */
  onResize?: (cols: number, rows: number) => void;
  /** Keystroke echo. False for pty sessions (the kernel tty echoes). */
  localEcho?: boolean;
}

export default function TerminalPane({ sessionId, onData, onResize, localEcho = true }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const localEchoRef = useRef(localEcho);
  localEchoRef.current = localEcho;
  const { resolvedMode } = useVestaraTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const theme = resolvedMode === 'dark'
      ? { background: '--vestara-surface-canvas', foreground: '--vestara-text-primary', cursor: '--vestara-text-primary', selectionBackground: '--vestara-accent-bg' }
      : { background: '--vestara-surface-canvas', foreground: '--vestara-text-primary', cursor: '--vestara-text-primary', selectionBackground: '--vestara-accent-bg' };

    const term = new Terminal({
      cols: 80,
      rows: 24,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      lineHeight: 1.35,
      theme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    _termMap.set(sessionId, term);

    el.innerHTML = '';
    const xtermEl = document.createElement('div');
    xtermEl.style.width = '100%';
    xtermEl.style.height = '100%';
    el.appendChild(xtermEl);
    term.open(xtermEl);
    try {
      fit.fit();
      onResizeRef.current?.(term.cols, term.rows);
    } catch {
      /* fit before layout — backend keeps spawn defaults */
    }

    // GA-TERM-001 Phase 3: no local prompt. The backend shell owns the
    // prompt and all output; this pane only echoes keystrokes (piped stdio
    // has no tty line discipline to echo for us) and forwards raw input.
    // Reconnect replay arrives as server frames like any other output.
    term.onData((data) => {
      const handled = onDataRef.current?.(data);
      // Spawn-driver echo: piped stdio has no tty to echo for us. Pty
      // sessions echo in-kernel — local echo would double-type.
      if (localEchoRef.current && handled !== false) {
        for (const ch of data) {
          if (ch === '\x7f') {
            term.write('\b \b');
          } else if (ch >= ' ') {
            term.write(ch);
          }
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
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        onResizeRef.current?.(term.cols, term.rows);
      } catch {
        /* transient layout — ignore */
      }
    });
    ro.observe(el);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      el.removeEventListener('mousedown', focusTerm);
      el.removeEventListener('click', focusTerm);
      _termMap.delete(sessionId);
      term.dispose();
    };
  }, [sessionId, resolvedMode]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 bg-[var(--vestara-surface-canvas)] outline-none" />
  );
}
