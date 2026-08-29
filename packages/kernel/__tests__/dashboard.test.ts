import type { WidgetManifest } from '@vestara/widget-runtime';
import { afterEach, describe, expect, it } from 'vitest';
import { DefaultKernel } from '../src/index';

const kernels: DefaultKernel[] = [];
afterEach(async () => {
  for (const kernel of kernels.splice(0)) await kernel.shutdown();
});

function manifest(id: string, location: WidgetManifest['location'] = 'center'): WidgetManifest {
  return {
    id,
    version: '1.0.0',
    name: id,
    description: `Widget ${id}`,
    category: 'system',
    icon: 'widget',
    permissions: [],
    events: [],
    refresh: 'manual',
    location,
    priority: 10,
    subsystem: 'test',
  };
}

describe('Kernel dashboard client composition (v9.0)', () => {
  it('exposes a dashboardRuntime after boot', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({});
    expect(typeof kernel.dashboardRuntime).toBe('object');
    expect(typeof kernel.dashboardRuntime.registerManifests).toBe('function');
  });

  it('registers widget manifests provided at boot', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({ widgets: [manifest('w1'), manifest('w2', 'right')] });
    const manifests = kernel.dashboardRuntime.getManifests();
    expect(manifests).toHaveLength(2);
    const layout = kernel.dashboardRuntime.getLayout();
    expect(layout.center).toContain('w1');
    expect(layout.right).toContain('w2');
  });

  it('orders layout by widget priority', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({
      widgets: [
        { ...manifest('low', 'left'), priority: 50 },
        { ...manifest('high', 'left'), priority: 5 },
      ],
    });
    const layout = kernel.dashboardRuntime.getLayout();
    expect(layout.left).toEqual(['high', 'low']);
  });

  it('exposes dashboardRuntime types via the kernel surface', async () => {
    const kernel = new DefaultKernel();
    kernels.push(kernel);
    await kernel.boot({});
    expect(kernel.dashboardRuntime.getManifests()).toEqual([]);
    expect(kernel.dashboardRuntime.getLayout()).toEqual({ left: [], center: [], right: [], full: [] });
  });
});
