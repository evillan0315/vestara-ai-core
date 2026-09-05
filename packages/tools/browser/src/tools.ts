/**
 * @vestara/tools-browser — governed browser / computer-use tools.
 *
 * Implements the VestaraTool contract against a shared BrowserSession. Read-only
 * actions (navigate/snapshot/screenshot) run automatically; interactions
 * (click/type) are medium-risk; close releases the shared session.
 */

import type { ToolExecutionContext, ToolExecutionResult, ToolInputSchema, VestaraTool } from '@vestara/tool-runtime';
import { type BrowserScreenshotResult, type BrowserSession, isAbortError, sessionKey } from './session';

// ─── Shared input parsing ───────────────────────────────────────

function record(input: unknown): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Browser tool input must be an object');
  return input as Record<string, unknown>;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Browser tool input requires non-empty string: ${key}`);
  return value;
}

function optionalString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Browser tool input must be a string: ${key}`);
  return value;
}

function optionalNumber(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Browser tool input must be a finite number: ${key}`);
  return value;
}

function optionalBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`Browser tool input must be a boolean: ${key}`);
  return value;
}

function evidenceId(operation: string): string {
  return `${operation}-${Date.now()}`;
}

function failure(error: unknown): ToolExecutionResult<never> {
  if (isAbortError(error)) return { status: 'cancelled', evidence: [] };
  return { status: 'failed', error: error instanceof Error ? error.message : String(error), evidence: [] };
}

// ─── browser.navigate ───────────────────────────────────────────

interface BrowserNavigateInput {
  readonly url: string;
}

export class BrowserNavigateTool implements VestaraTool<BrowserNavigateInput, { url: string; title: string }> {
  readonly name = 'browser.navigate';
  readonly description = 'Navigate the shared browser session to a URL within the allowed origins';
  readonly risk = 'medium' as const;
  readonly inputSchema: ToolInputSchema<BrowserNavigateInput> = {
    jsonSchema: {
      type: 'object',
      properties: { url: { type: 'string', minLength: 1 } },
      required: ['url'],
      additionalProperties: false,
    },
    parse(input) {
      return { url: requiredString(record(input), 'url') };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    input: BrowserNavigateInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string; title: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.navigate(input.url, key, context.signal);
      return {
        status: 'completed',
        output: result,
        evidence: [
          {
            id: evidenceId('browser-navigate'),
            kind: 'custom',
            summary: `browser.navigate → ${result.url}`,
            metadata: {
              operation: 'browser.navigate',
              url: result.url,
              title: result.title,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.snapshot ───────────────────────────────────────────

interface BrowserSnapshotInput {
  readonly maxChars?: number;
}

export class BrowserSnapshotTool
  implements VestaraTool<BrowserSnapshotInput, { url: string; title: string; text: string }>
{
  readonly name = 'browser.snapshot';
  readonly description = 'Return the visible text of the current page for the agent to read';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserSnapshotInput> = {
    jsonSchema: {
      type: 'object',
      properties: { maxChars: { type: 'number', minimum: 100, maximum: 100_000 } },
      additionalProperties: false,
    },
    parse(input) {
      return { maxChars: optionalNumber(record(input), 'maxChars') };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    input: BrowserSnapshotInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string; title: string; text: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.snapshot(key, context.signal);
      const maxChars = input.maxChars ?? 8_000;
      const redacted = this.session.redactSnapshot(result.text, result.url);
      const text = redacted.text.length > maxChars ? `${redacted.text.slice(0, maxChars)}…` : redacted.text;
      return {
        status: 'completed',
        output: { url: result.url, title: result.title, text },
        evidence: [
          {
            id: evidenceId('browser-snapshot'),
            kind: 'custom',
            summary: `browser.snapshot → ${result.url}`,
            metadata: {
              operation: 'browser.snapshot',
              url: result.url,
              chars: text.length,
              governance: this.session.governance(result.url, context.agentId, redacted.redactionStatus),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.screenshot ─────────────────────────────────────────

interface BrowserScreenshotInput {
  readonly encoding?: 'data-url';
}

export class BrowserScreenshotTool implements VestaraTool<BrowserScreenshotInput, BrowserScreenshotOutput> {
  readonly name = 'browser.screenshot';
  readonly description = 'Capture a PNG screenshot of the current page and return it as a data URL';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserScreenshotInput> = {
    jsonSchema: {
      type: 'object',
      properties: { encoding: { type: 'string', enum: ['data-url'] } },
      additionalProperties: false,
    },
    parse(input) {
      return { encoding: optionalString(record(input), 'encoding') as 'data-url' | undefined };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    _input: BrowserScreenshotInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<BrowserScreenshotOutput>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      // ENG-007 enforcement: when the resolved origin policy requires redaction,
      // raw pixels cannot be selectively redacted — refuse to return them.
      const key = sessionKey(context.agentId, context.taskId);
      const policy = this.session.policyFor(this.session.lastKnownUrl(key));
      if (policy.redaction !== 'off') {
        const output: BrowserScreenshotOutput = {
          url: policy.origin + policy.route,
          redacted: true,
          redactionReason: `screenshot blocked by ${policy.redaction} redaction policy for ${policy.origin}`,
        };
        return {
          status: 'completed',
          output,
          evidence: [
            {
              id: evidenceId('browser-screenshot'),
              kind: 'screenshot',
              summary: `browser.screenshot → blocked (${policy.redaction} redaction policy)`,
              metadata: {
                operation: 'browser.screenshot',
                url: output.url,
                redacted: true,
                governance: this.session.governance(output.url, context.agentId, 'redacted'),
                replay: this.session.replayDescriptor(key),
              },
            },
          ],
        };
      }
      const result = await this.session.screenshot(key, context.signal);
      return {
        status: 'completed',
        output: toScreenshotOutput(result),
        evidence: [
          {
            id: evidenceId('browser-screenshot'),
            kind: 'screenshot',
            summary: `browser.screenshot → ${result.url}`,
            metadata: {
              operation: 'browser.screenshot',
              url: result.url,
              width: result.width,
              height: result.height,
              size: result.bytes.byteLength,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

export interface BrowserScreenshotOutput {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly size?: number;
  readonly dataUrl?: string;
  readonly redacted?: boolean;
  readonly redactionReason?: string;
}

function toScreenshotOutput(result: BrowserScreenshotResult): BrowserScreenshotOutput {
  let encoded = '';
  for (let i = 0; i < result.bytes.byteLength; i += 1) encoded += String.fromCharCode(result.bytes[i]!);
  return {
    url: result.url,
    width: result.width,
    height: result.height,
    size: result.bytes.byteLength,
    dataUrl: `data:image/png;base64,${typeof Buffer === 'undefined' ? btoa(encoded) : Buffer.from(result.bytes).toString('base64')}`,
  };
}

// ─── browser.observe ─────────────────────────────────────────

interface BrowserObserveInput {
  readonly maxElements?: number;
}

export class BrowserObserveTool
  implements
    VestaraTool<
      BrowserObserveInput,
      { url: string; title: string; observationId: string; elements: readonly import('./session').BrowserElementRef[] }
    >
{
  readonly name = 'browser.observe';
  readonly description = 'Observe the current page and return structured element references for interactive elements';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserObserveInput> = {
    jsonSchema: {
      type: 'object',
      properties: { maxElements: { type: 'number', minimum: 1, maximum: 200 } },
      additionalProperties: false,
    },
    parse(input) {
      return { maxElements: optionalNumber(record(input), 'maxElements') };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    input: BrowserObserveInput,
    context: ToolExecutionContext,
  ): Promise<
    ToolExecutionResult<{
      url: string;
      title: string;
      observationId: string;
      elements: readonly import('./session').BrowserElementRef[];
    }>
  > {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.observe(key, context.signal);
      const maxElements = input.maxElements ?? 100;
      const elements = result.elements.slice(0, maxElements);
      return {
        status: 'completed',
        output: { url: result.url, title: result.title, observationId: result.observationId, elements },
        evidence: [
          {
            id: evidenceId('browser-observe'),
            kind: 'custom',
            summary: `browser.observe → ${result.url} (${elements.length} elements)`,
            metadata: {
              operation: 'browser.observe',
              url: result.url,
              observationId: result.observationId,
              elementCount: elements.length,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.click ──────────────────────────────────────────────

interface BrowserClickInput {
  readonly selector?: string;
  readonly x?: number;
  readonly y?: number;
  readonly observationId?: string;
  readonly ref?: string;
}

export class BrowserClickTool implements VestaraTool<BrowserClickInput, { url: string }> {
  readonly name = 'browser.click';
  readonly description = 'Click an element by CSS selector, viewport coordinates, or observation ref';
  readonly risk = 'medium' as const;
  readonly inputSchema: ToolInputSchema<BrowserClickInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', minLength: 1 },
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
        observationId: { type: 'string', minLength: 1 },
        ref: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
    parse(input) {
      const parsed = record(input);
      const selector = optionalString(parsed, 'selector');
      const x = optionalNumber(parsed, 'x');
      const y = optionalNumber(parsed, 'y');
      const observationId = optionalString(parsed, 'observationId');
      const ref = optionalString(parsed, 'ref');

      if (observationId && ref) {
        return { observationId, ref };
      }
      if (observationId || ref) {
        throw new Error('browser.click requires both observationId and ref, or a selector/coordinates');
      }
      if (!selector && (x === undefined || y === undefined))
        throw new Error('browser.click requires a selector, coordinates, or observationId+ref');
      if (selector && (x !== undefined || y !== undefined))
        throw new Error('browser.click accepts a selector or coordinates, not both');
      return { selector, x, y };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(input: BrowserClickInput): readonly string[] {
    if (input.ref) return [`ref:${input.ref}`];
    return [input.selector ?? `point:${input.x},${input.y}`];
  }

  async execute(
    input: BrowserClickInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      if (input.observationId && input.ref) {
        await this.session.clickRef(input.observationId, input.ref, key, context.signal);
      } else {
        await this.session.click(
          input.selector ?? 'body',
          input.selector ? undefined : { x: input.x as number, y: input.y as number },
          key,
          context.signal,
        );
      }
      const { url } = await this.session.snapshot(key, context.signal);
      const redacted = this.session.redactSnapshot('', url);
      return {
        status: 'completed',
        output: { url },
        evidence: [
          {
            id: evidenceId('browser-click'),
            kind: 'custom',
            summary: input.ref
              ? `browser.click ref=${input.ref}`
              : `browser.click ${input.selector ?? `@${input.x},${input.y}`}`,
            metadata: {
              operation: 'browser.click',
              selector: input.selector ?? null,
              x: input.x ?? null,
              y: input.y ?? null,
              observationId: input.observationId ?? null,
              ref: input.ref ?? null,
              url,
              governance: this.session.governance(url, context.agentId, redacted.redactionStatus),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.type ───────────────────────────────────────────────

interface BrowserTypeInput {
  readonly selector?: string;
  readonly text: string;
  readonly submit?: boolean;
  readonly observationId?: string;
  readonly ref?: string;
}

export class BrowserTypeTool implements VestaraTool<BrowserTypeInput, { url: string }> {
  readonly name = 'browser.type';
  readonly description = 'Fill a form field by CSS selector or observation ref, optionally pressing Enter to submit';
  readonly risk = 'medium' as const;
  readonly inputSchema: ToolInputSchema<BrowserTypeInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', minLength: 1 },
        text: { type: 'string' },
        submit: { type: 'boolean' },
        observationId: { type: 'string', minLength: 1 },
        ref: { type: 'string', minLength: 1 },
      },
      required: ['text'],
      additionalProperties: false,
    },
    parse(input) {
      const parsed = record(input);
      const observationId = optionalString(parsed, 'observationId');
      const ref = optionalString(parsed, 'ref');
      if (observationId && ref) {
        return {
          observationId,
          ref,
          text: requiredString(parsed, 'text'),
          submit: optionalBoolean(parsed, 'submit'),
        };
      }
      if (observationId || ref) {
        throw new Error('browser.type requires both observationId and ref, or a selector');
      }
      return {
        selector: requiredString(parsed, 'selector'),
        text: requiredString(parsed, 'text'),
        submit: optionalBoolean(parsed, 'submit'),
      };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(input: BrowserTypeInput): readonly string[] {
    if (input.ref) return [`ref:${input.ref}`];
    return [input.selector ?? 'unknown'];
  }

  async execute(input: BrowserTypeInput, context: ToolExecutionContext): Promise<ToolExecutionResult<{ url: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      if (input.observationId && input.ref) {
        await this.session.typeRef(
          input.observationId,
          input.ref,
          input.text,
          input.submit ?? false,
          key,
          context.signal,
        );
      } else {
        await this.session.type(input.selector!, input.text, input.submit ?? false, key, context.signal);
      }
      const { url } = await this.session.snapshot(key, context.signal);
      const redacted = this.session.redactSnapshot('', url);
      return {
        status: 'completed',
        output: { url },
        evidence: [
          {
            id: evidenceId('browser-type'),
            kind: 'custom',
            summary: input.ref
              ? `browser.type ref=${input.ref}${input.submit ? ' (submit)' : ''}`
              : `browser.type → ${input.selector}${input.submit ? ' (submit)' : ''}`,
            metadata: {
              operation: 'browser.type',
              selector: input.selector ?? null,
              observationId: input.observationId ?? null,
              ref: input.ref ?? null,
              submit: input.submit ?? false,
              url,
              governance: this.session.governance(url, context.agentId, redacted.redactionStatus),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.scroll ─────────────────────────────────────────

interface BrowserScrollInput {
  readonly direction: 'up' | 'down';
  readonly amount?: number;
}

export class BrowserScrollTool implements VestaraTool<BrowserScrollInput, { scrolled: boolean }> {
  readonly name = 'browser.scroll';
  readonly description = 'Scroll the page up or down by a pixel amount';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserScrollInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
        amount: { type: 'number', minimum: 1, maximum: 10000 },
      },
      required: ['direction'],
      additionalProperties: false,
    },
    parse(input) {
      const parsed = record(input);
      return {
        direction: requiredString(parsed, 'direction') as 'up' | 'down',
        amount: optionalNumber(parsed, 'amount') ?? 500,
      };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    input: BrowserScrollInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ scrolled: boolean }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      await this.session.scroll(input.direction, input.amount ?? 500, key, context.signal);
      return {
        status: 'completed',
        output: { scrolled: true },
        evidence: [
          {
            id: evidenceId('browser-scroll'),
            kind: 'custom',
            summary: `browser.scroll ${input.direction} ${input.amount ?? 500}px`,
            metadata: {
              operation: 'browser.scroll',
              direction: input.direction,
              amount: input.amount ?? 500,
              governance: this.session.governance(this.session.lastKnownUrl(key), context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.wait ───────────────────────────────────────────

interface BrowserWaitInput {
  readonly timeoutMs?: number;
}

export class BrowserWaitTool implements VestaraTool<BrowserWaitInput, { url: string; title: string }> {
  readonly name = 'browser.wait';
  readonly description = 'Wait for the page to finish loading (networkidle)';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserWaitInput> = {
    jsonSchema: {
      type: 'object',
      properties: { timeoutMs: { type: 'number', minimum: 1000, maximum: 60_000 } },
      additionalProperties: false,
    },
    parse(input) {
      return { timeoutMs: optionalNumber(record(input), 'timeoutMs') };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    _input: BrowserWaitInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string; title: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.waitForNavigation(key, context.signal);
      return {
        status: 'completed',
        output: result,
        evidence: [
          {
            id: evidenceId('browser-wait'),
            kind: 'custom',
            summary: `browser.wait → ${result.url}`,
            metadata: {
              operation: 'browser.wait',
              url: result.url,
              title: result.title,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.back ───────────────────────────────────────────

type BrowserBackInput = {};

export class BrowserBackTool implements VestaraTool<BrowserBackInput, { url: string; title: string }> {
  readonly name = 'browser.back';
  readonly description = 'Navigate back in browser history';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserBackInput> = {
    jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    parse() {
      return {};
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    _input: BrowserBackInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string; title: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.back(key, context.signal);
      return {
        status: 'completed',
        output: result,
        evidence: [
          {
            id: evidenceId('browser-back'),
            kind: 'custom',
            summary: `browser.back → ${result.url}`,
            metadata: {
              operation: 'browser.back',
              url: result.url,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.forward ────────────────────────────────────────

type BrowserForwardInput = {};

export class BrowserForwardTool implements VestaraTool<BrowserForwardInput, { url: string; title: string }> {
  readonly name = 'browser.forward';
  readonly description = 'Navigate forward in browser history';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserForwardInput> = {
    jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    parse() {
      return {};
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    _input: BrowserForwardInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string; title: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.forward(key, context.signal);
      return {
        status: 'completed',
        output: result,
        evidence: [
          {
            id: evidenceId('browser-forward'),
            kind: 'custom',
            summary: `browser.forward → ${result.url}`,
            metadata: {
              operation: 'browser.forward',
              url: result.url,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.reload ─────────────────────────────────────────

type BrowserReloadInput = {};

export class BrowserReloadTool implements VestaraTool<BrowserReloadInput, { url: string; title: string }> {
  readonly name = 'browser.reload';
  readonly description = 'Reload the current page';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserReloadInput> = {
    jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    parse() {
      return {};
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    _input: BrowserReloadInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ url: string; title: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const result = await this.session.reload(key, context.signal);
      return {
        status: 'completed',
        output: result,
        evidence: [
          {
            id: evidenceId('browser-reload'),
            kind: 'custom',
            summary: `browser.reload → ${result.url}`,
            metadata: {
              operation: 'browser.reload',
              url: result.url,
              governance: this.session.governance(result.url, context.agentId),
              replay: this.session.replayDescriptor(key),
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}

// ─── browser.close ──────────────────────────────────────────────

interface BrowserCloseInput {
  readonly reset?: boolean;
}

export class BrowserCloseTool implements VestaraTool<BrowserCloseInput, { closed: boolean }> {
  readonly name = 'browser.close';
  readonly description = "Close the calling agent's isolated browser page, releasing its state";
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<BrowserCloseInput> = {
    jsonSchema: {
      type: 'object',
      properties: { reset: { type: 'boolean' } },
      additionalProperties: false,
    },
    parse(input) {
      return { reset: optionalBoolean(record(input), 'reset') };
    },
  };

  constructor(private readonly session: BrowserSession) {}

  affectedResources(): readonly string[] {
    return ['browser'];
  }

  async execute(
    _input: BrowserCloseInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ closed: boolean }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const key = sessionKey(context.agentId, context.taskId);
      const replay = this.session.replayDescriptor(key);
      await this.session.close(key);
      return {
        status: 'completed',
        output: { closed: true },
        evidence: [
          {
            id: evidenceId('browser-close'),
            kind: 'custom',
            summary: 'browser.close',
            metadata: {
              operation: 'browser.close',
              governance: this.session.governance(this.session.lastKnownUrl(key), context.agentId, 'not-applicable'),
              replay,
            },
          },
        ],
      };
    } catch (error) {
      return failure(error);
    }
  }
}
