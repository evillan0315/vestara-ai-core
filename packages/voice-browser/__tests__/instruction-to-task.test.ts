import { describe, expect, it } from 'vitest';
import { extractCredentials, extractTarget, planBrowserTask } from '../src/instruction-to-task.js';

const OPTS = { sessionId: 'web:live', ownerId: 'web' } as const;

describe('extractTarget', () => {
  it('extracts a full http(s) URL', () => {
    expect(extractTarget('go to https://example.com/path')).toBe('https://example.com/path');
  });

  it('normalizes a bare domain with https://', () => {
    expect(extractTarget('visit github.com')).toBe('https://github.com');
  });

  it('prefers the domain after "on" for search-style instructions', () => {
    expect(extractTarget('search for monitors on amazon.com')).toBe('https://amazon.com');
  });
});

describe('extractCredentials', () => {
  it('parses "as <user> with <pass>"', () => {
    expect(extractCredentials('log in as alice with s3cret')).toMatchObject({
      username: 'alice',
      password: 's3cret',
    });
  });

  it('parses "username <u> password <p>"', () => {
    expect(extractCredentials('login username bob password pw123')).toMatchObject({
      username: 'bob',
      password: 'pw123',
    });
  });

  it('returns undefined when no credentials are present', () => {
    expect(extractCredentials('go to the login page')).toBeUndefined();
  });
});

describe('planBrowserTask', () => {
  it('plans a plain navigation', () => {
    const { task } = planBrowserTask('go to https://example.com', OPTS);
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0]).toMatchObject({ action: 'navigate', input: { url: 'https://example.com' } });
  });

  it('plans a login flow with credentials', () => {
    const { task, warnings } = planBrowserTask('log in to github.com as alice with s3cret', OPTS);
    expect(warnings).toHaveLength(0);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'type', 'type', 'click']);
    expect(task.steps[0]?.input).toMatchObject({ url: 'https://github.com' });
    expect(task.steps[1]?.input).toMatchObject({ text: 'alice' });
    expect(task.steps[2]?.input).toMatchObject({ text: 's3cret' });
  });

  it('plans a login flow without credentials to the sign-in page', () => {
    const { task, warnings } = planBrowserTask('log in to github.com', OPTS);
    expect(warnings.length).toBeGreaterThan(0);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'wait']);
  });

  it('plans a search with a target site', () => {
    const { task } = planBrowserTask('search for chocolate on example.com', OPTS);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'type']);
    expect(task.steps[0]?.input).toMatchObject({ url: 'https://example.com' });
    expect(task.steps[1]?.input).toMatchObject({ text: 'chocolate', submit: true });
  });

  it('plans a shop/buy flow ending at the results page', () => {
    const { task, warnings } = planBrowserTask('shop for headphones on example.com', OPTS);
    expect(warnings.length).toBeGreaterThan(0);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'type', 'extract']);
  });

  it('plans single-action commands', () => {
    expect(planBrowserTask('go back', OPTS).task.steps[0]?.action).toBe('back');
    expect(planBrowserTask('go forward', OPTS).task.steps[0]?.action).toBe('forward');
    expect(planBrowserTask('refresh the page', OPTS).task.steps[0]?.action).toBe('reload');
    expect(planBrowserTask('scroll down 300', OPTS).task.steps[0]?.input).toMatchObject({
      direction: 'down',
      amount: 300,
    });
    expect(planBrowserTask('take a screenshot', OPTS).task.steps[0]?.action).toBe('screenshot');
    expect(planBrowserTask('extract the page text', OPTS).task.steps[0]?.action).toBe('extract');
  });

  it('plans click with a text selector for free-form targets', () => {
    const { task } = planBrowserTask('click the Add to cart button', OPTS);
    expect(task.steps[0]).toMatchObject({
      action: 'click',
      input: { selector: 'text=Add to cart button' },
    });
  });

  it('plans type into a given selector', () => {
    const { task } = planBrowserTask('type "hello" into input[name="q"]', OPTS);
    expect(task.steps[0]).toMatchObject({
      action: 'type',
      input: { text: 'hello', selector: 'input[name="q"]' },
    });
  });

  it('uses the base URL as the fallback target', () => {
    const { task } = planBrowserTask('search for widgets', {
      ...OPTS,
      baseUrl: 'https://example.com',
    });
    expect(task.steps[0]?.action).toBe('type');
    expect(task.steps[0]?.input).toMatchObject({ text: 'widgets', submit: true });
  });

  it('throws a descriptive error for unrecognized instructions', () => {
    expect(() => planBrowserTask('quantum banana', OPTS)).toThrow(/Could not understand the instruction/);
  });
});

describe('planBrowserTask — compound clauses, waits, and field mapping', () => {
  it('plans the full multi-step instruction: navigate + wait + type', () => {
    const { task, warnings } = planBrowserTask(
      'go to google. then wait for the page to load and when you see the search box type money',
      OPTS,
    );
    expect(warnings).toHaveLength(0);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'wait', 'type']);
    expect(task.steps[0]?.input).toMatchObject({ url: 'https://google.com' });
    expect(task.steps[1]?.input).toEqual({});
    expect(task.steps[2]?.input).toMatchObject({
      text: 'money',
      selector: expect.stringContaining('input[role="searchbox"]'),
    });
  });

  it('expands a bare site name to https://<name>.com', () => {
    const { task } = planBrowserTask('go to google', OPTS);
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0]?.input).toMatchObject({ url: 'https://google.com' });
  });

  it('plans a standalone wait for the page to load', () => {
    const { task } = planBrowserTask('wait for the page to load', OPTS);
    expect(task.steps.map((s) => s.action)).toEqual(['wait']);
  });

  it('plans wait + type from a wait-and-type sentence', () => {
    const { task } = planBrowserTask('wait for the page to load and when you see the search box type money', OPTS);
    expect(task.steps.map((s) => s.action)).toEqual(['wait', 'type']);
    expect(task.steps[1]?.input).toMatchObject({ text: 'money' });
  });

  it('maps a human field name to search-box selectors', () => {
    const { task } = planBrowserTask('type money into the search box', OPTS);
    expect(task.steps[0]?.input).toMatchObject({
      text: 'money',
      selector: expect.stringContaining('input[role="searchbox"]'),
    });
  });

  it('tolerates a missing space before "in"', () => {
    const { task } = planBrowserTask('Type "money"in the search box', OPTS);
    expect(task.steps[0]?.input).toMatchObject({
      text: 'money',
      selector: expect.stringContaining('input[role="searchbox"]'),
    });
  });

  it('plans navigate + click from "go to example.com and click the Submit button"', () => {
    const { task } = planBrowserTask('go to example.com and click the Submit button', OPTS);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'click']);
    expect(task.steps[1]?.input).toMatchObject({ selector: 'text=Submit button' });
  });

  it('keeps multi-term searches as a single search step (no clause split)', () => {
    const { task } = planBrowserTask('search for monitors and keyboards on amazon.com', OPTS);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'type']);
    expect(task.steps[1]?.input).toMatchObject({ text: 'monitors and keyboards', submit: true });
  });

  it('plans navigate + search from "go to google then search for widgets"', () => {
    const { task } = planBrowserTask('go to google then search for widgets', OPTS);
    expect(task.steps.map((s) => s.action)).toEqual(['navigate', 'type']);
    expect(task.steps[0]?.input).toMatchObject({ url: 'https://google.com' });
    expect(task.steps[1]?.input).toMatchObject({ text: 'widgets', submit: true });
  });
});
