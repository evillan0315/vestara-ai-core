import { describe, expect, it } from 'vitest';
import { DefaultActionRuntime } from '../src/index';

const engine = {
  checkPermission: async () => ({ authorized: true, requiresConfirmation: false }),
  grantConfirmation: async () => {},
} as never;

const tool = {
  definition: { id: 'echo', permissions: [], category: 'test' },
  execute: async () => ({ success: true, data: 'hi', duration: 1 }),
} as never;

function request(toolId: string) {
  return { toolId, parameters: {}, context: {} } as never;
}

describe('DefaultActionRuntime contract', () => {
  it('registers and lists tools', () => {
    const runtime = new DefaultActionRuntime({ permissionEngine: engine });
    runtime.registerTool(tool);
    expect(runtime.getTool('echo')).toBe(tool);
    expect(runtime.getTool('missing')).toBeNull();
    expect(runtime.listTools()).toHaveLength(1);
  });

  it('fails unknown tools and executes authorized ones', async () => {
    const runtime = new DefaultActionRuntime({ permissionEngine: engine });
    const missing = await runtime.executeAction(request('nope'));
    expect(missing.status).toBe('failed');
    runtime.registerTool(tool);
    const ok = await runtime.executeAction(request('echo'));
    expect(ok.status).toBe('completed');
    expect(ok.toolId).toBe('echo');
  });
});
