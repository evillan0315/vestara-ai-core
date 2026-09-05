import { describe, expect, it } from 'vitest';
import {
  DefaultVoiceBrowserPipeline,
  intentToAction,
  parseVoiceIntent,
  StubBrowserEngine,
  TerminalActionRenderer,
} from '../dist/index.js';

// ─── Voice Intent Parser ──────────────────────────────────────

describe('Voice Intent Parser', () => {
  describe('parseVoiceIntent', () => {
    it('parses navigate URL commands', () => {
      const intent = parseVoiceIntent('go to https://example.com');
      expect(intent.type).toBe('navigate_url');
      expect(intent.params.url).toBe('https://example.com');
      expect(intent.confidence).toBeGreaterThan(0.5);
    });

    it('parses navigate URL without protocol', () => {
      const intent = parseVoiceIntent('open www.google.com');
      expect(intent.type).toBe('navigate_url');
      expect(intent.params.url).toBe('https://www.google.com');
    });

    it('parses navigate URL with domain', () => {
      const intent = parseVoiceIntent('visit github.com');
      expect(intent.type).toBe('navigate_url');
      expect(intent.params.url).toBe('https://github.com');
    });

    it('parses search commands', () => {
      const intent = parseVoiceIntent('search for TypeScript generics');
      expect(intent.type).toBe('navigate_search');
      expect(intent.params.query).toBe('TypeScript generics');
    });

    it('parses google shorthand', () => {
      const intent = parseVoiceIntent('google weather in London');
      expect(intent.type).toBe('navigate_search');
      expect(intent.params.query).toBe('weather in London');
    });

    it('parses natural language queries', () => {
      const intent = parseVoiceIntent('what is the capital of France');
      expect(intent.type).toBe('navigate_search');
      expect(intent.params.query).toContain('capital of France');
    });

    it('parses click commands', () => {
      const intent = parseVoiceIntent('click on the login button');
      expect(intent.type).toBe('click_element');
      expect(intent.params.element).toBe('login button');
    });

    it('parses type commands', () => {
      const intent = parseVoiceIntent('type hello world');
      expect(intent.type).toBe('type_text');
      expect(intent.params.text).toBe('hello world');
    });

    it('parses type with quotes', () => {
      const intent = parseVoiceIntent('type "search query"');
      expect(intent.type).toBe('type_text');
      expect(intent.params.text).toBe('search query');
    });

    it('parses scroll down', () => {
      const intent = parseVoiceIntent('scroll down');
      expect(intent.type).toBe('scroll_page');
      expect(intent.params.direction).toBe('down');
    });

    it('parses scroll up with amount', () => {
      const intent = parseVoiceIntent('scroll up 80 percent');
      expect(intent.type).toBe('scroll_page');
      expect(intent.params.direction).toBe('up');
      expect(intent.params.amount).toBe(80);
    });

    it('parses go back', () => {
      const intent = parseVoiceIntent('go back');
      expect(intent.type).toBe('go_back');
    });

    it('parses go forward', () => {
      const intent = parseVoiceIntent('go forward');
      expect(intent.type).toBe('go_forward');
    });

    it('parses reload', () => {
      const intent = parseVoiceIntent('reload page');
      expect(intent.type).toBe('reload_page');
    });

    it('parses screenshot', () => {
      const intent = parseVoiceIntent('take a screenshot');
      expect(intent.type).toBe('take_screenshot');
    });

    it('parses extract text', () => {
      const intent = parseVoiceIntent('extract page text');
      expect(intent.type).toBe('extract_page_text');
    });

    it('parses close tab', () => {
      const intent = parseVoiceIntent('close this tab');
      expect(intent.type).toBe('close_tab');
    });

    it('parses new tab', () => {
      const intent = parseVoiceIntent('open a new tab');
      expect(intent.type).toBe('new_tab');
    });

    it('falls back to search for unknown text', () => {
      const intent = parseVoiceIntent('random words here');
      expect(intent.type).toBe('navigate_search');
      expect(intent.confidence).toBeLessThan(0.5);
    });

    it('returns unknown for empty input', () => {
      const intent = parseVoiceIntent('');
      expect(intent.type).toBe('unknown');
      expect(intent.confidence).toBe(0);
    });
  });

  describe('intentToAction', () => {
    it('converts navigate_url to navigate action', () => {
      const intent = parseVoiceIntent('go to https://example.com');
      const action = intentToAction(intent);
      expect(action.type).toBe('navigate');
      expect(action.value).toBe('https://example.com');
    });

    it('converts click to click action', () => {
      const intent = parseVoiceIntent('click submit');
      const action = intentToAction(intent);
      expect(action.type).toBe('click');
      expect(action.selector).toBe('submit');
    });

    it('converts type to type action', () => {
      const intent = parseVoiceIntent('type hello');
      const action = intentToAction(intent);
      expect(action.type).toBe('type');
      expect(action.value).toBe('hello');
    });

    it('converts scroll to scroll action', () => {
      const intent = parseVoiceIntent('scroll down');
      const action = intentToAction(intent);
      expect(action.type).toBe('scroll');
      expect(action.scrollDirection).toBe('down');
    });
  });
});

// ─── Stub Browser Engine ──────────────────────────────────────

describe('StubBrowserEngine', () => {
  it('records navigate actions', async () => {
    const browser = new StubBrowserEngine();
    const result = await browser.navigate('https://example.com');
    expect(result.success).toBe(true);
    expect(result.action.type).toBe('navigate');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].value).toBe('https://example.com');
  });

  it('records click actions', async () => {
    const browser = new StubBrowserEngine();
    await browser.click('button.submit');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].selector).toBe('button.submit');
  });

  it('records type actions', async () => {
    const browser = new StubBrowserEngine();
    await browser.type('input.search', 'hello world');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].value).toBe('hello world');
  });

  it('records scroll actions', async () => {
    const browser = new StubBrowserEngine();
    await browser.scroll('down', 100);
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].scrollDirection).toBe('down');
  });

  it('returns current page', async () => {
    const browser = new StubBrowserEngine();
    const page = await browser.getCurrentPage();
    expect(page.url).toBe('about:blank');
    expect(page.title).toBe('Stub Page');
  });

  it('returns screenshot stub', async () => {
    const browser = new StubBrowserEngine();
    const screenshot = await browser.screenshot();
    expect(screenshot).toBe('stub-screenshot-base64');
  });

  it('returns text stub', async () => {
    const browser = new StubBrowserEngine();
    const text = await browser.getText();
    expect(text).toBe('stub page text content');
  });
});

// ─── Terminal Action Renderer ─────────────────────────────────

describe('TerminalActionRenderer', () => {
  it('renders navigate action', () => {
    const renderer = new TerminalActionRenderer();
    const visual = renderer.renderAction({ type: 'navigate', value: 'https://example.com' });
    expect(visual.type).toBe('navigating');
    expect(visual.label).toContain('example.com');
  });

  it('renders click action', () => {
    const renderer = new TerminalActionRenderer();
    const visual = renderer.renderAction({ type: 'click', selector: 'button' });
    expect(visual.type).toBe('clicking');
    expect(visual.label).toContain('button');
  });

  it('renders type action', () => {
    const renderer = new TerminalActionRenderer();
    const visual = renderer.renderAction({ type: 'type', value: 'hello' });
    expect(visual.type).toBe('typing');
    expect(visual.label).toContain('hello');
  });

  it('tracks listening state', () => {
    const renderer = new TerminalActionRenderer();
    renderer.renderListening(true);
    expect(renderer.getOverlay().isListening).toBe(true);
    renderer.renderListening(false);
    expect(renderer.getOverlay().isListening).toBe(false);
  });

  it('tracks transcription', () => {
    const renderer = new TerminalActionRenderer();
    renderer.renderTranscription('hello world', false);
    expect(renderer.getOverlay().transcription).toBe('hello world');
  });

  it('updates URL', () => {
    const renderer = new TerminalActionRenderer();
    renderer.updateUrl('https://example.com');
    expect(renderer.getOverlay().currentUrl).toBe('https://example.com');
  });

  it('clears actions', () => {
    const renderer = new TerminalActionRenderer();
    renderer.renderAction({ type: 'navigate', value: 'test' });
    renderer.clear();
    expect(renderer.getOverlay().actions).toHaveLength(0);
  });
});

// ─── Pipeline Integration ─────────────────────────────────────

describe('DefaultVoiceBrowserPipeline', () => {
  it('creates pipeline with stub browser', () => {
    const pipeline = new DefaultVoiceBrowserPipeline({
      browserEngine: new StubBrowserEngine(),
    });
    expect(pipeline.state).toBe('idle');
    expect(pipeline.isListening).toBe(false);
  });

  it('starts and stops pipeline', async () => {
    const pipeline = new DefaultVoiceBrowserPipeline({
      browserEngine: new StubBrowserEngine(),
    });
    await pipeline.start();
    expect(pipeline.isListening).toBe(true);
    await pipeline.stop();
    expect(pipeline.isListening).toBe(false);
  });

  it('executes voice command: navigate', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('go to https://example.com');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].type).toBe('navigate');
    expect(pipeline.currentUrl).toBe('https://example.com');
    await pipeline.stop();
  });

  it('executes voice command: search', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('search for TypeScript docs');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].type).toBe('navigate');
    expect(browser.actions[0].value).toContain('google.com/search');
    await pipeline.stop();
  });

  it('executes voice command: click', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('click login button');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].type).toBe('click');
    await pipeline.stop();
  });

  it('executes voice command: type', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('type hello world');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].type).toBe('type');
    await pipeline.stop();
  });

  it('executes voice command: scroll', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('scroll down');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].type).toBe('scroll');
    await pipeline.stop();
  });

  it('executes voice command: back', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('go back');
    expect(browser.actions).toHaveLength(1);
    expect(browser.actions[0].type).toBe('go_back');
    await pipeline.stop();
  });

  it('handles unknown commands gracefully', async () => {
    const browser = new StubBrowserEngine();
    const pipeline = new DefaultVoiceBrowserPipeline({ browserEngine: browser });
    await pipeline.start();
    await pipeline.executeVoiceCommand('');
    expect(browser.actions).toHaveLength(0);
    await pipeline.stop();
  });

  it('returns overlay state', async () => {
    const pipeline = new DefaultVoiceBrowserPipeline({
      browserEngine: new StubBrowserEngine(),
    });
    await pipeline.start();
    const overlay = pipeline.getOverlay();
    expect(overlay).toHaveProperty('actions');
    expect(overlay).toHaveProperty('isListening');
    expect(overlay).toHaveProperty('isProcessing');
    await pipeline.stop();
  });
});
