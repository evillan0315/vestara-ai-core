// Bun-only smoke test for the OpenTUI render path. OpenTUI's native FFI only
// runs under Bun (Node throws "native FFI is not available for this runtime"),
// so this test runs via `bun test` from the package test script, never Vitest.

import { describe, expect, it } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { OpenTuiRenderer } from '@vestara/tui-renderer';
import { createElement } from 'react';

describe('OpenTuiRenderer', () => {
  it('starts, renders, and reports viewport without throwing', async () => {
    const setup = await createTestRenderer({ width: 80, height: 24, useThread: false });
    const renderer = new OpenTuiRenderer({ renderer: setup.renderer });
    await renderer.start();
    expect(renderer.isDestroyed).toBe(false);
    const viewport = renderer.getViewport();
    expect(viewport.columns).toBe(80);
    expect(viewport.rows).toBe(24);
    renderer.render(createElement('box', { flexDirection: 'column' }, createElement('text', {}, 'vestara tui smoke')));
    await setup.flush();
    expect(renderer.getCapabilities().color).toBe(true);
    renderer.destroy();
    expect(renderer.isDestroyed).toBe(true);
  });

  it('subscribes to destroy events', async () => {
    const setup = await createTestRenderer({ width: 80, height: 24, useThread: false });
    const renderer = new OpenTuiRenderer({ renderer: setup.renderer });
    await renderer.start();
    let destroyed = 0;
    const unsubscribe = renderer.onDestroy(() => destroyed++);
    renderer.destroy();
    expect(destroyed).toBe(1);
    unsubscribe();
  });
});
