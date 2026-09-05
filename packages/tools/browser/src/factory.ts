/**
 * @vestara/tools-browser — Browser tool set factory
 *
 * Binds the canonical browser tools to a shared BrowserSession so the
 * Agent Harness can register them with a ToolRuntime in one call.
 */

import type { VestaraTool } from '@vestara/tool-runtime';
import type { BrowserSession } from './session';
import {
  BrowserBackTool,
  BrowserClickTool,
  BrowserCloseTool,
  BrowserForwardTool,
  BrowserNavigateTool,
  BrowserObserveTool,
  BrowserReloadTool,
  BrowserScreenshotTool,
  BrowserScrollTool,
  BrowserSnapshotTool,
  BrowserTypeTool,
  BrowserWaitTool,
} from './tools';

/**
 * All canonical browser tools bound to a shared session.
 *
 * Usage:
 * ```ts
 * const runtime = new ToolRuntime();
 * for (const tool of createBrowserToolSet(session)) runtime.register(tool);
 * ```
 */
export function createBrowserToolSet(session: BrowserSession): readonly VestaraTool<unknown, unknown>[] {
  const tools: VestaraTool<unknown, unknown>[] = [
    new BrowserNavigateTool(session),
    new BrowserObserveTool(session),
    new BrowserSnapshotTool(session),
    new BrowserScreenshotTool(session),
    new BrowserClickTool(session),
    new BrowserTypeTool(session),
    new BrowserScrollTool(session),
    new BrowserWaitTool(session),
    new BrowserBackTool(session),
    new BrowserForwardTool(session),
    new BrowserReloadTool(session),
    new BrowserCloseTool(session),
  ];
  return tools;
}

/** The canonical browser tool names, in registration order. */
export const BROWSER_TOOL_NAMES: readonly string[] = [
  'browser.navigate',
  'browser.observe',
  'browser.snapshot',
  'browser.screenshot',
  'browser.click',
  'browser.type',
  'browser.scroll',
  'browser.wait',
  'browser.back',
  'browser.forward',
  'browser.reload',
  'browser.close',
];
