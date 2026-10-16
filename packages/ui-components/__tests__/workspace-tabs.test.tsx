/**
 * @vestara/ui-components — WorkspaceTabs routing contract.
 *
 * Guards the extension that lets the reusable pill tab bar back routed
 * section navigation (Marketplace): plain-string tabs still render as
 * buttons, object tabs with `href` render as anchors carrying
 * `aria-current`, count badges render, and `onNavigate` is wired on the
 * anchor. Static rendering — no DOM required.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type WorkspaceTabItem, WorkspaceTabs } from '../src/index';

const TABS: WorkspaceTabItem[] = [
  { id: '/marketplace', label: 'Discover', href: '/marketplace' },
  { id: '/marketplace/capabilities', label: 'Capabilities', href: '/marketplace/capabilities' },
  { id: '/marketplace/updates', label: 'Updates', href: '/marketplace/updates', badge: 3 },
];

describe('WorkspaceTabs', () => {
  it('renders plain-string tabs as buttons with aria-pressed', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTabs active="Code" tabs={['Files', 'Code']} onActive={() => {}} ariaLabel="Workspace" />,
    );
    expect(html).toContain('Files');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('<nav');
  });

  it('renders href tabs as anchors and marks the active one with aria-current', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTabs active="/marketplace/capabilities" tabs={TABS} onActive={() => {}} onNavigate={() => {}} />,
    );
    expect(html).toContain('href="/marketplace/capabilities"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/marketplace" aria-current');
  });

  it('renders a count badge and hides zero badges', () => {
    const withBadge = renderToStaticMarkup(
      <WorkspaceTabs active="/marketplace/updates" tabs={TABS} onActive={() => {}} />,
    );
    expect(withBadge).toContain('>3<');

    const zero: WorkspaceTabItem[] = [{ id: 'a', label: 'A', href: '/a', badge: 0 }];
    const withoutBadge = renderToStaticMarkup(<WorkspaceTabs active="a" tabs={zero} onActive={() => {}} />);
    expect(withoutBadge).not.toContain('>0<');
  });
});
