/**
 * @vestara/reasoning — Executive Brain (Brain 4)
 *
 * The Reasoning Runtime orchestrates how Vestara thinks. It selects
 * reasoning strategies, executes them through providers, scores
 * confidence, and decides when to escalate, verify, or delegate.
 *
 * Reasoning answers: "What is true?"
 * Decision answers:  "What should Vestara do?"
 *
 * Architecture Traceability:
 *   Blueprint: 05-ai-core/BRAIN-ARCHITECTURE.md → Brain 4
 *   Blueprint: 20-roadmaps/V1.0-ROADMAP.md → v0.2
 */

import type { CognitiveEngine } from '@vestara/cognitive';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ReasoningStrategyId =
  | 'fast-response'
  | 'deep-analysis'
  | 'multi-step-planning'
  | 'reflection'
  | 'verification'
  | 'consensus'
  | 'self-critique'
  | 'delegation';

export interface ReasoningContext {
  input: string;
  conversationId?: string;
  userId?: string;
  missionId?: string;
  history?: Array<{ role: string; content: string }>;
  availableProviders: string[];
  preferredProvider?: string;
  cognitiveEngine?: CognitiveEngine;
  confidence?: number;
}

export interface ReasoningResult {
  id: string;
  content: string;
  strategy: ReasoningStrategyId;
  confidence: number;
  sources: string[];
  assumptions: string[];
  provider: string;
  model: string;
  duration: number;
  tokens?: number;
  cost?: number;
  requiresAction: boolean;
  suggestedAction?: string;
  delegations?: Array<{ target: string; reason: string }>;
}

export interface ReasoningStrategy {
  readonly id: ReasoningStrategyId;
  supports(context: ReasoningContext): boolean;
  execute(context: ReasoningContext): Promise<ReasoningResult>;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER EXECUTOR
// ═══════════════════════════════════════════════════════════════

export interface ProviderExecutor {
  complete(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<{ content: string; model: string; provider: string; tokens: number; latency: number }>;
}

// ═══════════════════════════════════════════════════════════════
// STRATEGIES
// ═══════════════════════════════════════════════════════════════

export class FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'fast-response';
  supports(context: ReasoningContext): boolean {
    return context.input.length < 120;
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    return this.baseResult('fast-response', context);
  }
  protected baseResult(
    strategy: ReasoningStrategyId,
    context: ReasoningContext,
    overrides?: Partial<ReasoningResult>,
  ): ReasoningResult {
    const now = Date.now();
    return {
      id: `rs-${now}`,
      content: '',
      strategy,
      confidence: 0.7,
      sources: [],
      assumptions: [],
      provider: context.preferredProvider ?? 'opencode',
      model: 'deepseek-v4-flash-free',
      duration: 0,
      requiresAction: false,
      ...overrides,
    };
  }
}

export class DeepAnalysisStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'deep-analysis';
  readonly name = 'Deep Analysis';
  supports(context: ReasoningContext): boolean {
    const keywords = ['review', 'analyze', 'explain', 'compare', 'evaluate', 'why', 'how'];
    return keywords.some((k) => context.input.toLowerCase().includes(k));
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const result = this.baseResult('deep-analysis', context, {
      confidence: 0.5,
      model: context.preferredProvider ?? 'deepseek-v4-flash-free',
    });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
}

export class MultiStepPlanningStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'multi-step-planning';
  readonly name = 'Multi-Step Planning';
  supports(context: ReasoningContext): boolean {
    const keywords = ['plan', 'steps', 'first', 'then', 'sequence', 'strategy', 'roadmap'];
    return keywords.some((k) => context.input.toLowerCase().includes(k));
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const result = this.baseResult('multi-step-planning', context, { confidence: 0.4, requiresAction: true });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
}

export class ReflectionStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'reflection';
  readonly name = 'Reflection';
  supports(context: ReasoningContext): boolean {
    return (context.confidence ?? 1) < 0.5;
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const result = this.baseResult('reflection', context, { confidence: 0.3 });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
}

export class VerificationStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'verification';
  readonly name = 'Verification';
  supports(context: ReasoningContext): boolean {
    return context.input.toLowerCase().includes('verify') || context.input.toLowerCase().includes('check');
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const result = this.baseResult('verification', context, { confidence: 0.6, requiresAction: false });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
}

export class ConsensusStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'consensus';
  readonly name = 'Consensus';
  supports(context: ReasoningContext): boolean {
    return context.availableProviders.length >= 2 && (context.confidence ?? 1) < 0.3;
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const result = this.baseResult('consensus', context, { confidence: 0.8, sources: context.availableProviders });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
}

export class SelfCritiqueStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'self-critique';
  readonly name = 'Self Critique';
  supports(context: ReasoningContext): boolean {
    return context.input.toLowerCase().includes('improve') || context.input.toLowerCase().includes('better');
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const result = this.baseResult('self-critique', context, { confidence: 0.5 });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
}

export class DelegationStrategy extends FastResponseStrategy implements ReasoningStrategy {
  readonly id: ReasoningStrategyId = 'delegation';
  readonly name = 'Delegation';
  supports(context: ReasoningContext): boolean {
    const keywords = ['code', 'write', 'implement', 'debug', 'research', 'search', 'find'];
    return keywords.some((k) => context.input.toLowerCase().includes(k));
  }
  async execute(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const target = this.detectTarget(context.input);
    const result = this.baseResult('delegation', context, {
      confidence: 0.85,
      requiresAction: true,
      delegations: [{ target, reason: `Input requires ${target} capabilities` }],
    });
    result.duration = Math.round(performance.now() - start);
    return result;
  }
  private detectTarget(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('write') || lower.includes('implement') || lower.includes('code')) return 'coding-agent';
    if (lower.includes('research') || lower.includes('find') || lower.includes('search')) return 'research-agent';
    if (lower.includes('plan') || lower.includes('strategy')) return 'planning-agent';
    return 'conversation-agent';
  }
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY SELECTOR
// ═══════════════════════════════════════════════════════════════

export interface StrategySelector {
  select(context: ReasoningContext): ReasoningStrategy;
  register(strategy: ReasoningStrategy): void;
}

export class DefaultStrategySelector implements StrategySelector {
  private strategies: ReasoningStrategy[] = [];

  constructor() {
    // Register default strategies in priority order
    this.register(new DelegationStrategy());
    this.register(new MultiStepPlanningStrategy());
    this.register(new DeepAnalysisStrategy());
    this.register(new VerificationStrategy());
    this.register(new SelfCritiqueStrategy());
    this.register(new ReflectionStrategy());
    this.register(new ConsensusStrategy());
    this.register(new FastResponseStrategy());
  }

  register(strategy: ReasoningStrategy): void {
    this.strategies.push(strategy);
  }

  select(context: ReasoningContext): ReasoningStrategy {
    // First strategy that supports the context wins
    for (const strategy of this.strategies) {
      if (strategy.supports(context)) {
        return strategy;
      }
    }
    return this.strategies[this.strategies.length - 1]; // FastResponse fallback
  }
}

// ═══════════════════════════════════════════════════════════════
// REASONING RUNTIME
// ═══════════════════════════════════════════════════════════════

export interface ReasoningRuntime {
  readonly selector: StrategySelector;
  reason(context: ReasoningContext): Promise<ReasoningResult>;
  getMetrics(): ReasoningMetrics;
}

export interface ReasoningMetrics {
  totalExecutions: number;
  byStrategy: Record<string, number>;
  avgConfidence: number;
  avgDuration: number;
  delegations: number;
}

export class DefaultReasoningRuntime implements ReasoningRuntime {
  readonly selector: StrategySelector;
  private providerExecutor: ProviderExecutor;
  private logger?: Logger;
  private eventBus?: EventBus;
  private metrics: ReasoningMetrics = {
    totalExecutions: 0,
    byStrategy: {},
    avgConfidence: 0,
    avgDuration: 0,
    delegations: 0,
  };
  private counter = 0;

  constructor(opts: {
    selector?: StrategySelector;
    providerExecutor: ProviderExecutor;
    logger?: Logger;
    eventBus?: EventBus;
  }) {
    this.selector = opts.selector ?? new DefaultStrategySelector();
    this.providerExecutor = opts.providerExecutor;
    this.logger = opts.logger?.child({ component: 'reasoning' });
    this.eventBus = opts.eventBus;
  }

  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    const start = performance.now();
    const strategy = this.selector.select(context);

    await this.eventBus?.emit({
      type: 'reasoning:strategy.selected',
      source: 'executive-brain',
      payload: { strategy: strategy.id, inputLength: context.input.length },
    });

    // Execute strategy to get basic result structure
    const result = await strategy.execute(context);
    result.id = `rs-${Date.now()}-${++this.counter}`;

    // Execute through provider
    try {
      const providerResult = await this.providerExecutor.complete(
        context.preferredProvider ?? 'deepseek-v4-flash-free',
        [
          { role: 'system', content: this.getSystemPrompt(strategy.id) },
          ...(context.history?.slice(-10) ?? []),
          { role: 'user', content: context.input },
        ],
      );
      result.content = providerResult.content;
      result.provider = providerResult.provider;
      result.model = providerResult.model;
      result.tokens = providerResult.tokens;
    } catch (_error) {
      result.content = `[${strategy.id} unavailable]`;
      result.confidence = 0.1;
    }

    result.duration = Math.round(performance.now() - start);

    // Confidence adjustment
    if (result.duration < 500) result.confidence = Math.min(result.confidence + 0.1, 1.0);
    if (result.tokens && result.tokens > 1000) result.confidence = Math.min(result.confidence + 0.05, 1.0);

    // Track metrics
    this.metrics.totalExecutions++;
    this.metrics.byStrategy[strategy.id] = (this.metrics.byStrategy[strategy.id] ?? 0) + 1;
    this.metrics.avgConfidence =
      (this.metrics.avgConfidence * (this.metrics.totalExecutions - 1) + result.confidence) /
      this.metrics.totalExecutions;
    this.metrics.avgDuration =
      (this.metrics.avgDuration * (this.metrics.totalExecutions - 1) + result.duration) / this.metrics.totalExecutions;
    if (result.delegations && result.delegations.length > 0) this.metrics.delegations += result.delegations.length;

    // Emit telemetry
    await this.eventBus?.emit({
      type: 'reasoning:completed',
      source: 'executive-brain',
      payload: {
        strategy: strategy.id,
        confidence: result.confidence,
        duration: result.duration,
        tokens: result.tokens,
        provider: result.provider,
        requiresAction: result.requiresAction,
        delegations: result.delegations?.length ?? 0,
      },
    });

    this.logger?.info('Reasoning completed', {
      strategy: strategy.id,
      confidence: result.confidence.toFixed(2),
      duration: `${result.duration}ms`,
      tokens: result.tokens,
      provider: result.provider,
    });

    return result;
  }

  getMetrics(): ReasoningMetrics {
    return { ...this.metrics };
  }

  private getSystemPrompt(strategy: ReasoningStrategyId): string {
    const prompts: Record<ReasoningStrategyId, string> = {
      'fast-response': 'You are Vestara, an AI assistant. Be concise and accurate.',
      'deep-analysis':
        'You are Vestara, a deep analysis engine. Provide thorough, well-structured analysis with evidence.',
      'multi-step-planning':
        'You are Vestara, a planning engine. Break down complex goals into clear, actionable steps with dependencies and timelines.',
      reflection:
        'You are Vestara, a reflection engine. Review your previous response. Identify what could be improved. Provide a revised version.',
      verification:
        'You are Vestara, a verification engine. Check the provided information for accuracy. Flag any errors or uncertainties.',
      consensus:
        'You are Vestara, a consensus engine. Consider multiple perspectives. Provide the most reliable synthesis.',
      'self-critique':
        'You are Vestara, a self-critique engine. Analyze the proposed response for quality, accuracy, and completeness. Suggest improvements.',
      delegation:
        'You are Vestara, a delegation engine. Determine which specialized agent should handle this request. Route accordingly.',
    };
    return prompts[strategy] ?? prompts['fast-response'];
  }
}
