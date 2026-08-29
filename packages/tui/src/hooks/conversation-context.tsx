import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import type { TuiHostHandle } from '../host.js';
import { type ExecutionOutcome, projectExecutionOutcome } from '../state/execution-outcome.js';
import {
  cancelExecution,
  clearExecution,
  createStreamGate,
  gateStreamEvent,
  type StreamGateState,
  startExecution,
} from '../state/stream-gate.js';
import type { TuiEvent } from '../types.js';
import { useChat } from './use-chat.js';

export interface ConversationContextValue {
  readonly messages: ReturnType<typeof useChat>['messages'];
  readonly tools: ReturnType<typeof useChat>['tools'];
  readonly input: string;
  readonly busy: boolean;
  readonly inputFocused: boolean;
  readonly composerFocused: boolean;
  readonly activeExecutionId?: string;
  readonly outcome?: ExecutionOutcome;
  readonly setInput: (value: string) => void;
  readonly focusComposer: () => void;
  readonly blurComposer: () => void;
  readonly submit: () => Promise<void>;
  readonly cancel: () => void;
  readonly clear: () => void;
}

const ConversationContext = createContext<ConversationContextValue | undefined>(undefined);

export interface ConversationProviderProps {
  readonly host: TuiHostHandle;
  readonly notify: (level: 'success' | 'warning' | 'error' | 'info', message: string) => void;
  readonly children: ReactNode;
}

export function ConversationProvider(props: ConversationProviderProps): ReactNode {
  const chat = useChat();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<string>();
  const active = useRef<AbortController | undefined>(undefined);
  const inputRef = useRef(input);
  inputRef.current = input;
  const streamGateRef = useRef<StreamGateState>(createStreamGate());
  const activeExecutionRef = useRef<string | undefined>(undefined);
  const assistantIdRef = useRef<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<ExecutionOutcome>();

  const finishOutcome = useCallback(
    (executionId: string, cancelled: boolean, failed?: string) => {
      const assistantMessage = assistantIdRef.current
        ? chat.messages.find((message) => message.id === assistantIdRef.current)
        : undefined;
      assistantIdRef.current = undefined;
      const projected = projectExecutionOutcome({
        executionId,
        assistantMessage,
        tools: chat.tools,
        cancelled,
        failed,
      });
      setOutcome(projected);
    },
    [chat.messages, chat.tools],
  );

  const gate = useCallback(
    (kind: 'conversation-start' | 'conversation-delta' | 'conversation-complete' | 'tool', id: string) =>
      gateStreamEvent(streamGateRef.current, { kind, executionId: id }),
    [],
  );

  const handleEvent = useCallback(
    (event: TuiEvent) => {
      switch (event.type) {
        case 'message':
          chat.pushSystem(event.entry.content);
          break;
        case 'conversation-start':
          if (!gate('conversation-start', event.id).apply) return;
          assistantIdRef.current = event.id;
          chat.startAssistant(event.id);
          break;
        case 'conversation-delta':
          if (!gate('conversation-delta', event.id).apply) return;
          chat.appendDelta(event.id, event.content);
          break;
        case 'conversation-complete':
          if (!gate('conversation-complete', event.id).apply) return;
          chat.completeAssistant(event.id);
          break;
        case 'tool':
          if (!gate('tool', event.card.id).apply) return;
          chat.upsertTool(event.card);
          break;
        case 'notification':
          props.notify(event.level, event.message);
          break;
        case 'clear':
          chat.clear();
          break;
        default:
          break;
      }
    },
    // The stream gate lives in refs; the callback intentionally captures only
    // stable chat/notify references.
    [chat, gate, props.notify],
  );

  const submit = useCallback(async () => {
    const message = inputRef.current.trim();
    if (!message || busy) return;
    const executionId = `exec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const controller = new AbortController();
    active.current = controller;
    activeExecutionRef.current = executionId;
    setActiveExecutionId(executionId);
    streamGateRef.current = startExecution(streamGateRef.current, executionId);
    setInput('');
    chat.pushUser(message);
    setBusy(true);
    try {
      for await (const event of props.host.controller.execute(message, controller.signal)) handleEvent(event);
    } catch (error) {
      if (!controller.signal.aborted) {
        props.notify('error', error instanceof Error ? error.message : String(error));
        finishOutcome(executionId, false, error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        finishOutcome(executionId, false);
      }
      active.current = undefined;
      activeExecutionRef.current = undefined;
      setActiveExecutionId(undefined);
      streamGateRef.current = clearExecution(streamGateRef.current);
      setBusy(false);
    }
  }, [busy, chat, finishOutcome, handleEvent, props.host, props.notify]);

  const cancel = useCallback(() => {
    const executionId = activeExecutionRef.current;
    if (executionId) finishOutcome(executionId, true);
    active.current?.abort();
    active.current = undefined;
    streamGateRef.current = cancelExecution(streamGateRef.current);
    setBusy(false);
  }, [finishOutcome]);

  const clear = useCallback(() => {
    streamGateRef.current = clearExecution(streamGateRef.current);
    activeExecutionRef.current = undefined;
    setActiveExecutionId(undefined);
    setOutcome(undefined);
    chat.clear();
  }, [chat]);

  const [composerFocused, setComposerFocused] = useState(true);
  const focusComposer = useCallback(() => setComposerFocused(true), []);
  const blurComposer = useCallback(() => setComposerFocused(false), []);

  const value: ConversationContextValue = {
    messages: chat.messages,
    tools: chat.tools,
    input,
    busy,
    inputFocused: composerFocused && input.length > 0,
    composerFocused,
    activeExecutionId,
    outcome,
    setInput,
    focusComposer,
    blurComposer,
    submit,
    cancel,
    clear,
  };

  return <ConversationContext.Provider value={value}>{props.children}</ConversationContext.Provider>;
}

export function useConversation(): ConversationContextValue {
  const value = useContext(ConversationContext);
  if (!value) throw new Error('useConversation must be used inside ConversationProvider');
  return value;
}
