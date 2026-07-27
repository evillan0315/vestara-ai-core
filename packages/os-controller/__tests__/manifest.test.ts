import { describe, expect, it } from 'vitest';
import { createDefaultManifest, getProfile, getServicesByLayer, renderManifest } from '../src/manifest.js';

describe('AIOSManifest', () => {
  it('creates default manifest with 14 services', () => {
    const manifest = createDefaultManifest();
    expect(manifest.services.length).toBe(14);
    expect(manifest.target).toBe('vestara.target');
    expect(manifest.version).toBe('1.0.0');
  });

  it('has 3 deployment profiles', () => {
    const manifest = createDefaultManifest();
    expect(manifest.profiles.length).toBe(3);
    const ids = manifest.profiles.map((p) => p.id);
    expect(ids).toContain('developer');
    expect(ids).toContain('minimal');
    expect(ids).toContain('server');
  });

  it('services are grouped into 6 layers', () => {
    const manifest = createDefaultManifest();
    const layers = new Set(manifest.services.map((s) => s.layer));
    expect(layers.has(1)).toBe(true);
    expect(layers.has(6)).toBe(true);
  });

  it('each service has a unique id', () => {
    const manifest = createDefaultManifest();
    const ids = manifest.services.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kernel has no dependencies', () => {
    const manifest = createDefaultManifest();
    const kernel = manifest.services.find((s) => s.id === 'vestara-kernel');
    expect(kernel?.deps).toEqual([]);
  });

  it('dashboard depends on events and workspace', () => {
    const manifest = createDefaultManifest();
    const dash = manifest.services.find((s) => s.id === 'vestara-dashboard');
    expect(dash?.deps).toContain('vestara-events');
    expect(dash?.deps).toContain('vestara-workspace');
  });

  it('getServicesByLayer returns only services in that layer', () => {
    const manifest = createDefaultManifest();
    const layer1 = getServicesByLayer(manifest, 1);
    expect(layer1.every((s) => s.layer === 1)).toBe(true);
    expect(layer1.length).toBe(1);
    expect(layer1[0].id).toBe('vestara-kernel');
  });

  it('getProfile returns correct services', () => {
    const manifest = createDefaultManifest();
    const minimal = getProfile(manifest, 'minimal');
    expect(minimal).toBeDefined();
    expect(minimal!.services.length).toBe(3);
  });

  it('renderManifest produces output', () => {
    const manifest = createDefaultManifest();
    const output = renderManifest(manifest);
    expect(output).toContain('AI OS Manifest');
    expect(output).toContain('vestara-kernel');
    expect(output).toContain('vestara-dashboard');
  });
});
