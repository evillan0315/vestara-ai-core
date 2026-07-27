/**
 * @vestara/cognitive — Five-Stage Cognitive Processing Pipeline
 *
 * Perception → Understanding → Memory → Reasoning → Action
 *
 * Every interaction passes through all five stages. The cognitive
 * engine transforms Vestara from an execution engine into a
 * cognitive engine that learns from every exchange.
 *
 * Architecture Traceability:
 *   Blueprint: 05-ai-core/COGNITIVE-ARCHITECTURE.md
 *   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Memory
 *   Specification: AI-CON-001 → Memory Engine
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { Memory, MemoryLayer, MemoryRuntime, MemoryType } from '@vestara/memory';

// ─── Stage 1: Observation ────────────────────────────────────

export type ObservationSource =
  | 'conversation'
  | 'filesystem'
  | 'workspace'
  | 'voice'
  | 'tool'
  | 'organization'
  | 'system';

export interface Observation {
  id: string;
  source: ObservationSource;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ObservationEngine {
  observe(
    source: ObservationSource,
    type: string,
    payload: Record<string, unknown>,
    confidence?: number,
  ): Promise<Observation>;
  getRecent(count?: number): Observation[];
}

export class DefaultObservationEngine implements ObservationEngine {
  private observations: Observation[] = [];
  private eventBus?: EventBus;
  private logger?: Logger;
  private counter = 0;

  constructor(opts?: { eventBus?: EventBus; logger?: Logger }) {
    this.eventBus = opts?.eventBus;
    this.logger = opts?.logger?.child({ component: 'perception' });
  }

  async observe(
    source: ObservationSource,
    type: string,
    payload: Record<string, unknown>,
    confidence = 1.0,
  ): Promise<Observation> {
    const obs: Observation = {
      id: `obs-${Date.now()}-${++this.counter}`,
      source,
      timestamp: new Date().toISOString(),
      type,
      payload,
      confidence,
    };
    this.observations.push(obs);
    // Keep last 1000 in memory
    if (this.observations.length > 1000) this.observations.shift();

    await this.eventBus?.emit({
      type: 'cognitive:observation',
      source: 'cognitive-engine',
      payload: { observationId: obs.id, source, type },
    });

    return obs;
  }

  getRecent(count = 50): Observation[] {
    return this.observations.slice(-count);
  }
}

// ─── Stage 2: Understanding ──────────────────────────────────

export interface MemoryExtraction {
  type: MemoryType;
  content: string;
  importance: number; // 0.0 — 1.0
  confidence: number; // 0.0 — 1.0
  tags: string[];
  suggestedLayer: MemoryLayer;
  source?: string;
  relatesTo?: string[];
}

export interface UnderstandingResult {
  observationId: string;
  extractions: MemoryExtraction[];
  relationships: string[];
  confidence: number;
}

export interface UnderstandingEngine {
  process(observation: Observation): Promise<UnderstandingResult>;
}

export class DefaultUnderstandingEngine implements UnderstandingEngine {
  private eventBus?: EventBus;
  private logger?: Logger;

  constructor(opts?: { eventBus?: EventBus; logger?: Logger }) {
    this.eventBus = opts?.eventBus;
    this.logger = opts?.logger?.child({ component: 'understanding' });
  }

  async process(observation: Observation): Promise<UnderstandingResult> {
    const extractions: MemoryExtraction[] = [];

    if (observation.source === 'conversation') {
      const content = (observation.payload.content as string) ?? '';
      const role = observation.payload.role as string;

      if (role === 'user') {
        extractions.push(...this.extractFromUser(content));
      } else if (role === 'assistant') {
        extractions.push(...this.extractFromAssistant(content));
      }
    }

    if (observation.source === 'tool') {
      extractions.push(...this.extractFromTool(observation));
    }

    await this.eventBus?.emit({
      type: 'cognitive:understanding',
      source: 'cognitive-engine',
      payload: {
        observationId: observation.id,
        extractions: extractions.length,
      },
    });

    return {
      observationId: observation.id,
      extractions,
      relationships: [],
      confidence: extractions.reduce((a, e) => a + e.confidence, 0) / Math.max(extractions.length, 1),
    };
  }

  private extractFromUser(content: string): MemoryExtraction[] {
    const extractions: MemoryExtraction[] = [];
    const _lower = content.toLowerCase();

    // Preference detection: "I like/prefer/use X"
    const prefMatch = content.match(/i (?:like|prefer|use|enjoy|love) (.+?)(?:\.|,|$)/i);
    if (prefMatch) {
      extractions.push({
        type: 'preference',
        content: `User prefers: ${prefMatch[1].trim()}`,
        importance: 0.6,
        confidence: 0.7,
        tags: ['preference', 'user'],
        suggestedLayer: 'semantic',
        source: 'conversation',
      });
    }

    // Fact detection: "I am building/working on X"
    const factMatch = content.match(/i (?:am building|am working on|'m building|'m working on) (.+?)(?:\.|,|$)/i);
    if (factMatch) {
      extractions.push({
        type: 'fact',
        content: `Project: ${factMatch[1].trim()}`,
        importance: 0.85,
        confidence: 0.8,
        tags: ['project', 'fact'],
        suggestedLayer: 'semantic',
        source: 'conversation',
      });
    }

    // Goal detection: "I want to / I need to / I'm trying to"
    const goalMatch = content.match(/i (?:want to|need to|'m trying to|would like to) (.+?)(?:\.|,|$)/i);
    if (goalMatch) {
      extractions.push({
        type: 'fact',
        content: `Goal: ${goalMatch[1].trim()}`,
        importance: 0.9,
        confidence: 0.75,
        tags: ['goal', 'intent'],
        suggestedLayer: 'semantic',
        source: 'conversation',
      });
    }

    // Decision detection: "I decided / I switched / I changed"
    const decisionMatch = content.match(/i (?:decided|switched to|changed to|moved to) (.+?)(?:\.|,|$)/i);
    if (decisionMatch) {
      extractions.push({
        type: 'decision',
        content: `Decision: ${decisionMatch[1].trim()}`,
        importance: 0.8,
        confidence: 0.7,
        tags: ['decision', 'change'],
        suggestedLayer: 'long-term',
        source: 'conversation',
      });
    }

    // Event detection: non-extraction content as episodic memory
    if (extractions.length === 0 && content.length > 20) {
      extractions.push({
        type: 'event',
        content: content.slice(0, 200),
        importance: 0.3,
        confidence: 0.5,
        tags: ['conversation', 'event'],
        suggestedLayer: 'episodic',
        source: 'conversation',
      });
    }

    return extractions;
  }

  private extractFromAssistant(_content: string): MemoryExtraction[] {
    // Assistant responses are typically not extracted independently
    // They may create episodic memories if they contain summaries
    return [];
  }

  private extractFromTool(observation: Observation): MemoryExtraction[] {
    const extractions: MemoryExtraction[] = [];
    const toolId = observation.payload.toolId as string;

    if (toolId === 'vestara.filesystem.read') {
      extractions.push({
        type: 'event',
        content: `Read file: ${observation.payload.path as string}`,
        importance: 0.3,
        confidence: 0.9,
        tags: ['filesystem', 'read'],
        suggestedLayer: 'episodic',
        source: 'tool',
      });
    }

    return extractions;
  }
}

// ─── Stage 3: Memory Integration ────────────────────────────

export interface CognitiveEngine {
  readonly observation: ObservationEngine;
  readonly understanding: UnderstandingEngine;
  readonly memory: MemoryRuntime;

  /** Process an observation through the full pipeline */
  process(observation: Observation, userId: string): Promise<ProcessingResult>;
  /** Process a conversation exchange */
  processExchange(userId: string, role: string, content: string): Promise<ProcessingResult>;
}

export interface ProcessingResult {
  observation: Observation;
  understanding: UnderstandingResult;
  memories: Memory[];
  duration: number;
}

export class DefaultCognitiveEngine implements CognitiveEngine {
  readonly observation: ObservationEngine;
  readonly understanding: UnderstandingEngine;
  readonly memory: MemoryRuntime;
  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(opts: {
    observation: ObservationEngine;
    understanding: UnderstandingEngine;
    memory: MemoryRuntime;
    logger?: Logger;
    eventBus?: EventBus;
  }) {
    this.observation = opts.observation;
    this.understanding = opts.understanding;
    this.memory = opts.memory;
    this.logger = opts.logger?.child({ component: 'cognitive' });
    this.eventBus = opts.eventBus;
  }

  async process(observation: Observation, userId: string): Promise<ProcessingResult> {
    const start = performance.now();

    // Stage 2: Understand the observation
    const understanding = await this.understanding.process(observation);

    // Stage 3: Store extracted memories
    const memories: Memory[] = [];
    for (const extraction of understanding.extractions) {
      const memory = await this.memory.store(userId, {
        type: extraction.type,
        content: extraction.content,
        tags: extraction.tags,
        source: extraction.source,
        metadata: {
          observationId: observation.id,
          confidence: extraction.confidence,
          relatesTo: extraction.relatesTo,
        },
      });
      memories.push(memory);
    }

    const duration = Math.round(performance.now() - start);

    await this.eventBus?.emit({
      type: 'cognitive:processed',
      source: 'cognitive-engine',
      payload: {
        observationId: observation.id,
        extractions: understanding.extractions.length,
        memories: memories.length,
        duration,
      },
    });

    if (memories.length > 0) {
      this.logger?.info('Cognitive processing completed', {
        extractions: understanding.extractions.length,
        memories: memories.length,
        duration: `${duration}ms`,
      });
    }

    return { observation, understanding, memories, duration };
  }

  async processExchange(userId: string, role: string, content: string): Promise<ProcessingResult> {
    const observation = await this.observation.observe(
      'conversation',
      role === 'user' ? 'user.message' : 'assistant.response',
      { content, role },
      role === 'user' ? 0.95 : 0.8,
    );
    return this.process(observation, userId);
  }
}
