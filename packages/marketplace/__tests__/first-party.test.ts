/**
 * @vestara/marketplace — first-party scanner contracts.
 *
 * Proves the smallest coherent fix for UI-component / template / app
 * discovery: the detector honors the canonical types explicitly and via
 * heuristics, and the dependency-free builders project catalogs, template
 * dirs, and app manifests into correctly typed, tag-conventioned assets.
 */

import { describe, expect, it } from 'vitest';
import type { DetectedPackage } from '../src/detector/manifest-readers';
import { mapPackageType } from '../src/detector/type-mapper';
import { appManifestToAsset, templateDirToAsset, uiComponentCatalogToAssets } from '../src/first-party';

function detected(name: string, tags: string[] = [], raw: Record<string, unknown> = {}): DetectedPackage {
  return {
    name,
    version: '0.1.0',
    tags,
    dependencies: {},
    manifestFile: 'package.json',
    rawManifest: raw,
  };
}

describe('mapPackageType first-party heuristics', () => {
  it('honors explicit vestara.type for the new canonical types', () => {
    expect(mapPackageType(detected('whatever', [], { vestara: { type: 'ui-component' } }))).toBe('ui-component');
    expect(mapPackageType(detected('whatever', [], { vestara: { type: 'template' } }))).toBe('template');
    expect(mapPackageType(detected('whatever', [], { vestara: { type: 'app' } }))).toBe('app');
  });

  it('classifies templates, apps, and ui-components by name', () => {
    expect(mapPackageType(detected('blog-starter'))).toBe('template');
    expect(mapPackageType(detected('dashboard-app'))).toBe('app');
    expect(mapPackageType(detected('ui-components'))).toBe('ui-component');
    expect(mapPackageType(detected('vestara-design-system'))).toBe('ui-component');
  });

  it('classifies ui-components by tag convention', () => {
    expect(mapPackageType(detected('mystery-pkg', ['ui', 'primitives']))).toBe('ui-component');
    expect(mapPackageType(detected('mystery-pkg', ['template']))).toBe('template');
    expect(mapPackageType(detected('mystery-pkg', ['app']))).toBe('app');
  });

  it('leaves unrelated packages on the legacy path', () => {
    expect(mapPackageType(detected('my-provider', [], { vestara: { type: 'provider' } }))).toBe('provider');
    expect(mapPackageType(detected('plain-lib'))).toBe('module');
  });
});

describe('first-party builders', () => {
  it('projects catalog entries into ui-component assets', () => {
    const assets = uiComponentCatalogToAssets([
      { id: 'CalendarShell', name: 'CalendarShell', group: 'calendar', description: 'Scheduling shell' },
    ]);
    expect(assets).toHaveLength(1);
    expect(assets[0].type).toBe('ui-component');
    expect(assets[0].packageName).toBe('ui-components-calendarshell');
    expect(assets[0].tags).toEqual(expect.arrayContaining(['ui', 'components', 'calendar', 'calendarshell']));
    expect(assets[0].visibility).toBe('local');
  });

  it('projects template dirs and app manifests with the tag contract', () => {
    const template = templateDirToAsset({ packageName: 'blog-starter', description: 'Blog' });
    expect(template.type).toBe('template');
    expect(template.tags).toContain('template');

    const app = appManifestToAsset({ name: 'workspace', version: '1.2.3' });
    expect(app.type).toBe('app');
    expect(app.latestVersion).toBe('1.2.3');
    expect(app.tags).toContain('app');
  });
});
