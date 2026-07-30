import { useState } from 'react';
import type { ToolCall } from './types';

const TOOL_ICONS: Record<string, string> = {
  read: 'file-text',
  write: 'edit',
  search: 'search',
  run: 'terminal',
  execute: 'terminal',
  list: 'list',
  grep: 'search',
};

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
}

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!toolCalls || toolCalls.length === 0) return null;

  const allDone = toolCalls.every((tc) => tc.status === 'completed');
  const hasError = toolCalls.some((tc) => tc.status === 'error');

  return (
    <div className="my-2">
      <div className="relative">
        {/* Vertical line connecting tool calls */}
        <div className="absolute left-[9px] top-4 bottom-1 w-px bg-zinc-800" />

        <div className="space-y-1">
          {toolCalls.map((tc) => {
            const icon = TOOL_ICONS[tc.tool.split('_')[0]] || 'tool';
            const isExpanded = expanded === tc.id;

            return (
              <div key={tc.id} className="group relative pl-7">
                {/* Status dot */}
                <div className="absolute left-1 top-[7px]">
                  {tc.status === 'running' ? (
                    <span className="block w-[5px] h-[5px] rounded-full bg-amber-400 animate-pulse" />
                  ) : tc.status === 'completed' ? (
                    <span className="block w-[5px] h-[5px] rounded-full bg-green-500" />
                  ) : (
                    <span className="block w-[5px] h-[5px] rounded-full bg-red-500" />
                  )}
                </div>

                {/* Main row */}
                <div
                  onClick={() => (tc.args || tc.output) && setExpanded(isExpanded ? null : tc.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                    isExpanded ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'
                  }`}
                >
                  {/* Tool icon */}
                  <ToolIcon name={icon} />

                  {/* Tool name and status */}
                  <span className="text-[12px] text-zinc-400 font-mono flex-1">
                    {tc.tool}
                    {tc.status === 'running' && (
                      <span className="ml-2 text-[10px] text-zinc-600 animate-pulse">running...</span>
                    )}
                    {tc.status === 'completed' && tc.output && (
                      <span className="ml-2 text-[10px] text-zinc-600 truncate max-w-[160px] inline-block align-bottom">
                        {tc.output.slice(0, 60)}
                        {tc.output.length > 60 ? '...' : ''}
                      </span>
                    )}
                    {tc.status === 'error' && (
                      <span className="ml-2 text-[10px] text-red-400">{tc.error || 'failed'}</span>
                    )}
                  </span>

                  {/* Expand indicator */}
                  {(tc.args || tc.output) && (
                    <svg
                      className={`w-3 h-3 text-zinc-700 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="ml-2 mt-1 mb-2 space-y-1.5">
                    {tc.args && (
                      <div className="px-2.5 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-[11px] font-mono text-zinc-500 overflow-x-auto">
                        <div className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">Arguments</div>
                        <pre className="whitespace-pre-wrap">{tc.args}</pre>
                      </div>
                    )}
                    {tc.output && (
                      <div className="px-2.5 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded text-[11px] font-mono text-zinc-500 overflow-x-auto">
                        <div className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">Result</div>
                        <pre className="whitespace-pre-wrap">{tc.output}</pre>
                      </div>
                    )}
                    {tc.error && (
                      <div className="px-2.5 py-1.5 bg-red-900/10 border border-red-800/20 rounded text-[11px] font-mono text-red-400">
                        {tc.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary line */}
      {allDone && (
        <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-zinc-600">
          <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {hasError
            ? `${toolCalls.filter((t) => t.status === 'error').length} tool(s) failed`
            : `${toolCalls.length} tool(s) completed`}
        </div>
      )}
    </div>
  );
}

function ToolIcon({ name }: { name: string }) {
  switch (name) {
    case 'file-text':
      return (
        <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case 'edit':
      return (
        <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      );
    case 'search':
      return (
        <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      );
    case 'terminal':
      return (
        <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case 'list':
      return (
        <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    default:
      return (
        <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
  }
}
