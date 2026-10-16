/**
 * @vestara/ui-components — icon-prop rendering regression.
 *
 * Guards the `icon` prop contract: icons are React components (our vendored
 * icons are `forwardRef` objects), so they must be *rendered*, never invoked
 * as functions. Calling `icon({...})` throws `method.icon is not a function`
 * because `forwardRef` returns an object, not a callable. Every component
 * that accepts an `icon` prop is exercised through static rendering.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ActionGrid,
  ExtensionCard,
  icons,
  MethodTabs,
  OsUnitsCard,
  ProviderCard,
  StorageOptionCard,
  TracerBadge,
} from '../src/index';

describe('icon-prop rendering', () => {
  it('renders MethodTabs (forwardRef icons) without invoking them', () => {
    const html = renderToStaticMarkup(<MethodTabs value="passphrase" onChange={() => {}} />);
    expect(html).toContain('Passphrase');
    expect(html).toContain('Hardware Key');
    expect(html).toContain('<svg');
  });

  it('renders StorageOptionCard with a passed forwardRef icon', () => {
    const html = renderToStaticMarkup(
      <StorageOptionCard
        title="Portable SSD"
        desc="Boot anywhere"
        badge="REC"
        icon={icons.HardDrive}
        selected
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('Portable SSD');
    expect(html).toContain('<svg');
  });

  it('renders ProviderCard with a passed forwardRef icon', () => {
    const html = renderToStaticMarkup(
      <ProviderCard
        title="OpenCode"
        desc="Local runtime"
        meta="NO_KEY"
        icon={icons.Zap}
        selected
        onSelect={() => {}}
        isDefault
      />,
    );
    expect(html).toContain('OpenCode');
    expect(html).toContain('<svg');
  });

  it('renders ExtensionCard with a passed forwardRef icon', () => {
    const html = renderToStaticMarkup(
      <ExtensionCard
        title="Project Manager"
        desc="Kanban"
        icon={icons.Layers}
        size="12.4 MB"
        vers="v2.1.0"
        selected
        onToggle={() => {}}
      />,
    );
    expect(html).toContain('Project Manager');
    expect(html).toContain('<svg');
  });

  it('renders OsUnitsCard with default function icons', () => {
    const html = renderToStaticMarkup(<OsUnitsCard />);
    expect(html).toContain('OS Units');
    expect(html).toContain('<svg');
  });

  it('renders ActionGrid with default icons', () => {
    const html = renderToStaticMarkup(<ActionGrid onAction={() => {}} />);
    expect(html).toContain('Open');
    expect(html).toContain('Delete');
    expect(html).toContain('<svg');
  });

  it('renders TracerBadge', () => {
    const html = renderToStaticMarkup(<TracerBadge method="passphrase" ts="10:00" />);
    expect(html).toContain('passphrase');
  });
});
