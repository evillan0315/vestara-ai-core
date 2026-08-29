// Interpreted execution outcome projection.
//
// The approved UX requires chat to show a conclusion, observations, evidence,
// unresolved items, and next actions — not anonymous tool lifecycle labels.
// This module derives a structured outcome from the completed assistant
// message and the tool cards observed during the execution.

import type { ConversationEntry, ToolCard } from '../types.js';

export interface ExecutionOutcome {
  readonly executionId: string;
  readonly status: 'completed' | 'cancelled' | 'failed' | 'interrupted';
  readonly conclusion?: string;
  readonly observations: readonly string[];
  readonly evidence: readonly string[];
  readonly unresolved: readonly string[];
  readonly nextActions: readonly string[];
  readonly completedAt: string;
}

const EVIDENCE_MARKERS = /(\/[^\s]+(?:\.[a-zA-Z0-9]+)?|tests?\/[\w./-]+|docs?\/[\w./-]+)/g;

function extractEvidence(content: string): string[] {
  const matches = content.match(EVIDENCE_MARKERS) ?? [];
  return [...new Set(matches.map((match) => match.trim()))].slice(0, 20);
}

function splitSections(content: string): {
  conclusion: string;
  observations: string[];
  unresolved: string[];
  nextActions: string[];
} {
  const lines = content.split('\n');
  let section: 'conclusion' | 'observations' | 'unresolved' | 'next' = 'conclusion';
  const result: { conclusion: string; observations: string[]; unresolved: string[]; nextActions: string[] } = {
    conclusion: '',
    observations: [],
    unresolved: [],
    nextActions: [],
  };
  const heading = (line: string) => {
    const normalized = line.toLowerCase().replace(/[#*_\s]/g, '');
    if (normalized.includes('observation')) return 'observations';
    if (normalized.includes('unresolved') || normalized.includes('remaining')) return 'unresolved';
    if (normalized.includes('next') || normalized.includes('whatsnext')) return 'next';
    return undefined;
  };
  for (const line of lines) {
    const target = heading(line);
    if (target) {
      section = target;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.replace(/^[-•*]\s*/, '');
    if (section === 'conclusion') result.conclusion = result.conclusion ? `${result.conclusion} ${bullet}` : bullet;
    else if (section === 'observations') result.observations.push(bullet);
    else if (section === 'unresolved') result.unresolved.push(bullet);
    else if (section === 'next') result.nextActions.push(bullet);
  }
  return result;
}

export interface ProjectOutcomeInput {
  readonly executionId: string;
  readonly assistantMessage?: ConversationEntry;
  readonly tools: readonly ToolCard[];
  readonly cancelled: boolean;
  readonly failed?: string;
}

export function projectExecutionOutcome(input: ProjectOutcomeInput): ExecutionOutcome {
  const content = input.assistantMessage?.content ?? '';
  const sections = splitSections(content);
  const toolObservations = input.tools.map((tool) => `Tool ${tool.label} ${tool.status}`);
  const status: ExecutionOutcome['status'] = input.cancelled ? 'cancelled' : input.failed ? 'failed' : 'completed';
  return {
    executionId: input.executionId,
    status,
    conclusion: input.failed ?? sections.conclusion,
    observations: [...new Set([...sections.observations, ...toolObservations])],
    evidence: extractEvidence(content),
    unresolved: sections.unresolved,
    nextActions: sections.nextActions,
    completedAt: new Date().toISOString(),
  };
}

export function summarizeOutcome(outcome: ExecutionOutcome): string {
  switch (outcome.status) {
    case 'completed':
      return outcome.conclusion ?? 'The request completed.';
    case 'cancelled':
      return 'Execution cancelled.';
    case 'failed':
      return outcome.conclusion ?? 'Execution failed.';
    case 'interrupted':
      return 'Execution interrupted.';
  }
}
