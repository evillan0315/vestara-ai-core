import type { ProviderExecutor } from '@vestara/conversation';
import type {
  ComposerSuggestionCandidate,
  ComposerSuggestionContextReference,
  ComposerSuggestionRequest,
  ComposerSuggestionResponse,
} from '@vestara/shared';
import { requestContext } from './http/request-context';
import { searchDocumentation } from './routes/docs';

const MAX_DRAFT = 4_000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CONTENT = 500;

const suggestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'candidates'],
  properties: {
    status: { type: 'string', enum: ['candidates', 'ready', 'no_match'] },
    candidates: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'operation', 'title'],
        properties: {
          kind: { type: 'string' },
          operation: { type: 'string', enum: ['replace', 'append', 'refine', 'direction'] },
          title: { type: 'string', maxLength: 120 },
          text: { type: 'string', maxLength: 1_500 },
          rationale: { type: 'string', maxLength: 400 },
        },
      },
    },
  },
} as const;

interface SuggestionLogger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

type SuggestionProviderExecutor = ProviderExecutor & {
  readonly suggestionTransportAvailable?: boolean;
};

function bounded(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function parseStructuredOutput(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function contextReferences(
  request: ComposerSuggestionRequest,
  historyUsed: boolean,
): ComposerSuggestionContextReference[] {
  const refs: ComposerSuggestionContextReference[] = [];
  if (request.draft.trim())
    refs.push({ source: 'draft', label: 'Current draft', detail: request.draft.trim().slice(0, 240) });
  const surface = request.surfaceContext?.surface;
  if (surface?.path) refs.push({ source: 'surface', label: 'Current route', detail: surface.path });
  if (surface?.title) refs.push({ source: 'surface', label: 'Current surface', detail: surface.title });
  if (request.surfaceContext?.workspace.name && request.surfaceContext.workspace.name !== 'unknown') {
    refs.push({ source: 'workspace', label: 'Workspace', detail: request.surfaceContext.workspace.name });
  }
  if (historyUsed) refs.push({ source: 'conversation', label: 'Conversation', detail: 'Recent bounded messages' });
  return refs;
}

function normalizeCandidate(
  raw: unknown,
  index: number,
  context: readonly ComposerSuggestionContextReference[],
): ComposerSuggestionCandidate | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = raw as Record<string, unknown>;
  const title = bounded(item.title, 120);
  const operation = bounded(item.operation, 20);
  if (!title || !['replace', 'append', 'refine', 'direction'].includes(operation ?? '')) return undefined;
  const kind = bounded(item.kind, 30) ?? 'suggest';
  return {
    id: `composer-suggestion-${index + 1}`,
    kind: kind as ComposerSuggestionCandidate['kind'],
    operation: operation as ComposerSuggestionCandidate['operation'],
    title,
    ...(bounded(item.text, 1_500) ? { text: bounded(item.text, 1_500) } : {}),
    ...(bounded(item.rationale, 400) ? { rationale: bounded(item.rationale, 400) } : {}),
    context,
  };
}

export class ComposerSuggestionService {
  constructor(
    private readonly providerExecutor: SuggestionProviderExecutor,
    private readonly repoPath: string,
    private readonly getConversation?: (
      conversationId: string,
    ) => Promise<{ messages?: Array<{ role: string; content: string }> } | null>,
    private readonly logger?: SuggestionLogger,
  ) {}

  async suggest(request: ComposerSuggestionRequest): Promise<ComposerSuggestionResponse> {
    const requestId = requestContext.current(false).requestId;
    const startedAt = performance.now();
    const logContext = {
      requestId,
      mode: request.mode,
      assistantRuntime: request.assistantRuntime ?? 'opencode',
      requestedProvider: request.provider,
      requestedModel: request.model,
      suggestionOnly: true,
    };
    this.logger?.info('composer.suggestion.started', logContext);
    try {
      const draft = request.draft.trim().slice(0, MAX_DRAFT);
      const history =
        request.conversationId && this.getConversation ? await this.getConversation(request.conversationId) : null;
      const recentHistory = (history?.messages ?? [])
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-MAX_HISTORY_MESSAGES)
        .map((message) => `${message.role}: ${message.content.slice(0, MAX_HISTORY_CONTENT)}`);
      const context = contextReferences(request, recentHistory.length > 0);

      if (request.mode === 'docs') {
        const query = [draft, request.surfaceContext?.surface.title, request.surfaceContext?.surface.path]
          .filter(Boolean)
          .join(' ');
        const references = searchDocumentation(this.repoPath, query);
        if (references.length === 0) {
          const result = {
            mode: request.mode,
            status: 'no_match' as const,
            candidates: [],
            message: 'No sufficiently relevant repository documentation was established.',
          };
          this.logger?.info('composer.suggestion.completed', {
            ...logContext,
            durationMs: Math.round(performance.now() - startedAt),
            providerUsed: 'repository-documentation',
            candidateCount: 0,
            structuredOutputSource: 'not-applicable',
            activityRoomMirroring: 'none',
            resultStatus: result.status,
          });
          return result;
        }
        const docsContext = [
          ...context,
          ...references.map((reference) => ({
            source: 'documentation' as const,
            label: reference.title,
            detail: reference.path,
          })),
        ];
        const result: ComposerSuggestionResponse = {
          mode: request.mode,
          status: 'candidates' as const,
          candidates: references.slice(0, 5).map((reference, index) => ({
            id: `composer-doc-${index + 1}`,
            kind: 'docs',
            operation: 'direction',
            title: `Review ${reference.title}`,
            text: `Review ${reference.title} (${reference.path}) for guidance relevant to my current thought.`,
            rationale: reference.reason,
            context: docsContext,
            references: [reference],
          })),
        };
        this.logger?.info('composer.suggestion.completed', {
          ...logContext,
          durationMs: Math.round(performance.now() - startedAt),
          providerUsed: 'repository-documentation',
          candidateCount: result.candidates.length,
          structuredOutputSource: 'not-applicable',
          activityRoomMirroring: 'none',
          resultStatus: result.status,
        });
        return result;
      }

      if (!draft) {
        const result: ComposerSuggestionResponse = {
          mode: request.mode,
          status: 'no_match',
          candidates: [],
          message: 'A draft is required before suggestions can be generated.',
        };
        this.logger?.info('composer.suggestion.completed', {
          ...logContext,
          durationMs: Math.round(performance.now() - startedAt),
          providerUsed: 'none',
          candidateCount: 0,
          structuredOutputSource: 'not-applicable',
          activityRoomMirroring: 'none',
          resultStatus: result.status,
        });
        return result;
      }

      if (this.providerExecutor.suggestionTransportAvailable === false) {
        const result: ComposerSuggestionResponse = {
          mode: request.mode,
          status: 'no_match',
          candidates: [],
          message: 'Suggestion inference is unavailable while the OpenCode transport is offline.',
        };
        this.logger?.info('composer.suggestion.completed', {
          ...logContext,
          durationMs: Math.round(performance.now() - startedAt),
          providerUsed: 'unavailable',
          candidateCount: 0,
          structuredOutputSource: 'not-applicable',
          activityRoomMirroring: 'none',
          resultStatus: result.status,
        });
        return result;
      }

      const surface = request.surfaceContext?.surface;
      const contextBlock = [
        `Mode: ${request.mode}`,
        `Draft: ${draft || '(empty)'}`,
        surface?.path ? `Route: ${surface.path}` : '',
        surface?.title ? `Surface: ${surface.title}` : '',
        request.surfaceContext?.workspace.name ? `Workspace: ${request.surfaceContext.workspace.name}` : '',
        request.surfaceContext?.selected
          ? `Selected: ${request.surfaceContext.selected.kind} ${request.surfaceContext.selected.label ?? request.surfaceContext.selected.id}`
          : '',
        recentHistory.length > 0 ? `Recent conversation:\n${recentHistory.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const response = await this.providerExecutor.complete({
        // Let the dedicated OpenCode runtime own its configured default model.
        // The legacy `deepseek-v4-flash-free` id is not present in every
        // current OpenCode provider catalog.
        model: request.model ?? (request.assistantRuntime === 'codex' ? 'gpt-5.5' : 'opencode-runtime'),
        ...(request.provider ? { provider: request.provider } : {}),
        ...(request.assistantRuntime ? { assistantRuntime: request.assistantRuntime } : {}),
        suggestionOnly: true,
        suggestionRequestId: requestId,
        messages: [
          {
            role: 'system',
            content:
              'You help a human articulate an unsent composer draft. Return only the requested JSON structure. ' +
              'A suggestion is guidance, never an instruction, approval, permission, or execution. Preserve ambiguity; ' +
              'do not invent repository facts. For a clear draft, return status ready and one concise candidate or no expansion.',
          },
          { role: 'user', content: contextBlock },
        ],
        temperature: 0.2,
        maxTokens: 2_000,
        jsonSchema: suggestionSchema,
      });
      // Existing runtime adapters expose JSON-schema intent and may return the
      // validated object directly or JSON text. Accept both at this boundary;
      // normalizeCandidate remains the final allowlist/bounds check.
      const output = response.structuredOutput ?? parseStructuredOutput(response.content);
      const structuredOutputSource =
        response.structuredOutput !== undefined ? 'provider' : output !== undefined ? 'content-json' : 'none';
      if (!output || typeof output !== 'object') {
        const result = {
          mode: request.mode,
          status: 'no_match' as const,
          candidates: [],
          message: 'Suggestion output was unavailable.',
        };
        this.logger?.info('composer.suggestion.completed', {
          ...logContext,
          durationMs: Math.round(performance.now() - startedAt),
          providerUsed: response.provider,
          providerModel: response.model,
          providerLatencyMs: response.latency,
          usage: response.usage,
          runtimeSessionId: response.resolution?.runtimeSessionId ?? response.executionResult?.runtimeSessionId,
          structuredOutputSource,
          candidateCount: 0,
          activityRoomMirroring: 'suppressed',
          resultStatus: result.status,
        });
        return result;
      }
      const record = output as Record<string, unknown>;
      const candidates = Array.isArray(record.candidates)
        ? (record.candidates
            .map((item, index) => normalizeCandidate(item, index, context))
            .filter(Boolean)
            .slice(0, 5) as ComposerSuggestionCandidate[])
        : [];
      const status: ComposerSuggestionResponse['status'] =
        record.status === 'ready' || record.status === 'no_match'
          ? record.status
          : candidates.length > 0
            ? 'candidates'
            : 'no_match';
      const result = {
        mode: request.mode,
        status,
        candidates,
        ...(status === 'no_match'
          ? { message: 'The available context was not sufficient for a grounded suggestion.' }
          : {}),
      };
      this.logger?.info('composer.suggestion.completed', {
        ...logContext,
        durationMs: Math.round(performance.now() - startedAt),
        providerUsed: response.provider,
        providerModel: response.model,
        providerLatencyMs: response.latency,
        usage: response.usage,
        runtimeSessionId: response.resolution?.runtimeSessionId ?? response.executionResult?.runtimeSessionId,
        structuredOutputSource,
        candidateCount: result.candidates.length,
        activityRoomMirroring: 'suppressed',
        resultStatus: result.status,
      });
      return result;
    } catch (error) {
      this.logger?.error('composer.suggestion.failed', {
        ...logContext,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
        activityRoomMirroring: 'suppressed',
      });
      throw error;
    }
  }
}
