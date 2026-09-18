// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '../src/lib/theme.js';
import { RouteHero } from '../src/components/layout/PageHero/RouteHero.js';
import { ROUTE_HERO_CONFIG } from '../src/components/layout/PageHero/route-hero-config.js';

function locationProbe() {
  let current = '';
  function Probe() {
    current = useLocation().pathname;
    return null;
  }
  return { Probe, get: () => current };
}

afterEach(() => cleanup());

describe('workspace RouteHero binding', () => {
  it('resolves registry defaults by explicit routeId', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/diagnostics']}>
          <RouteHero routeId="diagnostics" />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(screen.getByText('Diagnostic Center')).toBeDefined();
    expect(screen.getByText('Live telemetry')).toBeDefined();
  });

  it('resolves routeId from the current URL when omitted', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/agents']}>
          <RouteHero />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(screen.getByText('Agent Control Center')).toBeDefined();
  });

  it('renders canonical tone dots and compact density from config', () => {
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/execution']}>
          <RouteHero routeId="execution" />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(screen.getByText('Execution Center')).toBeDefined();
    expect(container.innerHTML).not.toMatch(/mpg-hero--compact/);
    expect(container.innerHTML).toContain('var(--vestara-status-success)');
  });

  it('intercepts `to` actions with SPA navigation', () => {
    const probe = locationProbe();
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <probe.Probe />
          <Routes>
            <Route
              path="/dashboard"
              element={
                <RouteHero
                  routeId="dashboard"
                  title="Dashboard"
                  actions={[{ label: 'Agents', to: '/agents' }]}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('Agents'));
    expect(probe.get()).toBe('/agents');
  });

  it('registry covers every routeId consumers rely on', () => {
    for (const routeId of ['files', 'graph', 'diagnostics', 'execution', 'agents', 'orchestration']) {
      expect(ROUTE_HERO_CONFIG[routeId]?.title).toBeTruthy();
    }
  });
});
