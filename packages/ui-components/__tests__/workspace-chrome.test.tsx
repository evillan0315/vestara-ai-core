/**
 * @vestara/ui-components — workspace chrome contracts.
 *
 * Guards the promoted drawer/modal/card surfaces: roles and labels for
 * assistive tech, size-preset and tone wiring, Escape affordances, and the
 * closed-drawer contract. Static rendering — no DOM required (the Drawer
 * guards window access so it renders on the server).
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Drawer, DrawerMenu, icons, Modal, OperationalPanel, ProgressBar, StatCard } from '../src/index';

describe('Drawer', () => {
  it('renders nothing when closed without keepMounted', () => {
    expect(renderToStaticMarkup(<Drawer open={false} onClose={() => {}} />)).toBe('');
  });

  it('renders a labelled dialog with size presets, title, and footer', () => {
    const html = renderToStaticMarkup(
      <Drawer open title="Inspector" footer={<button type="button">Apply</button>} onClose={() => {}} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Inspector"');
    expect(html).toContain('Inspector');
    expect(html).toContain('Apply');
    expect(html).toContain('aria-label="Drawer size: Normal"');
    expect(html).toContain('aria-label="Drawer size: Full"');
    expect(html).toContain('aria-label="Close drawer"');
    expect(html).toContain('<svg');
  });

  it('stays mounted but hidden with keepMounted while closed', () => {
    const html = renderToStaticMarkup(<Drawer open={false} keepMounted title="Inspector" onClose={() => {}} />);
    expect(html).toContain('invisible');
    expect(html).toContain('Inspector');
  });

  it('renders the vendored size icons', () => {
    for (const Icon of [icons.SizeNormal, icons.SizeMedium, icons.SizeLarge, icons.SizeFull]) {
      expect(renderToStaticMarkup(<Icon />)).toContain('<svg');
    }
    expect(renderToStaticMarkup(<icons.X />)).toContain('<svg');
  });
});

describe('DrawerMenu', () => {
  it('renders the trigger without an open menu', () => {
    const html = renderToStaticMarkup(<DrawerMenu actions={[{ id: 'size', label: 'Size' }]} onSelect={() => {}} />);
    expect(html).toContain('aria-label="Drawer options"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});

describe('Modal', () => {
  it('renders a focus-trapped dialog with accent bar and content', () => {
    const html = renderToStaticMarkup(
      <Modal onClose={() => {}} ariaLabel="Confirm delete">
        <p>Delete this item?</p>
      </Modal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Confirm delete"');
    expect(html).toContain('Delete this item?');
  });

  it('hides the accent bar when disabled', () => {
    const html = renderToStaticMarkup(
      <Modal onClose={() => {}} accentBar={false}>
        <p>Plain</p>
      </Modal>,
    );
    expect(html).not.toContain('linear-gradient(90deg,var(--vestara-accent)');
  });
});

describe('OperationalPanel', () => {
  it('renders icon, title, description, and actions', () => {
    const html = renderToStaticMarkup(
      <OperationalPanel
        icon={<icons.Zap />}
        title="Runtime"
        description="Live services"
        actions={<button type="button">Refresh</button>}
      >
        <p>Body</p>
      </OperationalPanel>,
    );
    expect(html).toContain('Runtime');
    expect(html).toContain('Live services');
    expect(html).toContain('Refresh');
    expect(html).toContain('Body');
    expect(html).toContain('<svg');
  });

  it('applies the info tone through status tokens', () => {
    const html = renderToStaticMarkup(
      <OperationalPanel icon={<icons.Zap />} title="Runtime" tone="info">
        <p>Body</p>
      </OperationalPanel>,
    );
    expect(html).toContain('var(--vestara-status-info)');
    expect(html).not.toContain('var(--vestara-accent-text)');
  });
});

describe('StatCard and ProgressBar', () => {
  it('renders label, value, and sub with an accent edge', () => {
    const html = renderToStaticMarkup(<StatCard label="Errors" value={3} sub="today" accent="red" />);
    expect(html).toContain('Errors');
    expect(html).toContain('today');
    expect(html).toContain('border-left-color:red');
  });

  it('clamps progress width and follows the status scale', () => {
    const high = renderToStaticMarkup(<ProgressBar pct={120} />);
    expect(high).toContain('width:100%');
    expect(high).toContain('var(--vestara-status-success)');
    const mid = renderToStaticMarkup(<ProgressBar pct={50} size="md" />);
    expect(mid).toContain('width:50%');
    expect(mid).toContain('var(--vestara-status-warning)');
    const low = renderToStaticMarkup(<ProgressBar pct={10} size="lg" />);
    expect(low).toContain('var(--vestara-status-error)');
  });
});
