/**
 * Marketplace — Templates.
 *
 * Theme templates that merge the extracted Vestara Shell Foundation palette
 * with the Settings → General → Theme appearance axes — accent palette,
 * font family, and font weight — all from the canonical @vestara/ui-tokens
 * authority (ACCENT_PALETTES / FONT_FAMILIES / FONT_WEIGHTS).
 *
 * Layout: appearance summary axes → theme template preview cards (accent +
 * font sample + surface ramp) → installable template assets (AssetCard grid).
 *
 * Data: live registry first (theme category); THEME_TEMPLATES /
 * THEME_TEMPLATE_FIXTURES are the fallback reference examples — never
 * presented as live data. Tokens: only var(--vestara-*) via marketplace.css
 * + the shared mpg-* gallery grammar (no inline visual literals).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  ACCENT_PALETTES,
  FONT_FAMILIES,
  FONT_FAMILY_IDS,
  FONT_WEIGHT_IDS,
  FONT_WEIGHTS,
} from '@vestara/ui-tokens';
import {
  AssetCard,
  AssetGridSkeleton,
  assetMatchesCategory,
  displayForLiveAsset,
  MarketplaceEmptyState,
  MarketplacePage,
  MarketplaceSection,
  MarketplaceStatPill,
  TEMPLATE_COUNT,
  THEME_TEMPLATES,
  THEME_TEMPLATE_FIXTURES,
  templateAccent,
  templateFontFamily,
  templateFontWeight,
  type DiscoverDisplayMeta,
  type NavigateHandler,
} from '@vestara/marketplace-ui';

const TEMPLATE_FIXTURE_ASSETS: MarketplaceAsset[] = THEME_TEMPLATE_FIXTURES.map(
  (fixture) => fixture.asset as MarketplaceAsset,
);

// ─── Appearance Axes (Settings → General → Theme appearance parity) ──

function AppearanceAxes() {
  const accentIds = useMemo(() => Object.keys(ACCENT_PALETTES) as Array<keyof typeof ACCENT_PALETTES>, []);
  return (
    <div className="mpg-card grid gap-3 p-4 lg:grid-cols-3">
      <div className="relative z-[2]">
        <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
          Accent colors
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {accentIds.map((id) => {
            const palette = ACCENT_PALETTES[id];
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 py-0.5"
                title={palette.label}
              >
                <span
                  className="size-3 rounded-full border border-[var(--vestara-border-subtle)]"
                  style={{ backgroundColor: palette.hex }}
                  aria-hidden="true"
                />
                <span className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
                  {palette.label}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="relative z-[2]">
        <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
          Font families
        </span>
        <ul className="mt-2 space-y-1">
          {FONT_FAMILY_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between rounded px-1.5 py-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]"
              style={{ fontFamily: FONT_FAMILIES[id].stack }}
            >
              <span>{FONT_FAMILIES[id].label}</span>
              <span className="font-mono text-[var(--vestara-text-disabled)]">{FONT_FAMILIES[id].kind}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative z-[2]">
        <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
          Font weights
        </span>
        <ul className="mt-2 space-y-1">
          {FONT_WEIGHT_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between rounded px-1.5 py-0.5 text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)]"
              style={{ fontWeight: FONT_WEIGHTS[id].value }}
            >
              <span>{FONT_WEIGHTS[id].label}</span>
              <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">
                {FONT_WEIGHTS[id].value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Template Preview Card ──────────────────────────────────────

function TemplateCard({ template, index }: { template: (typeof THEME_TEMPLATES)[number]; index: number }) {
  const palette = templateAccent(template);
  const font = templateFontFamily(template);
  const weight = templateFontWeight(template);

  return (
    <article
      className="mpg-card mpg-enter relative flex flex-col gap-3 p-4"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      aria-label={`${template.name} theme template`}
    >
      <span className="mpg-card-accent" style={{ background: palette.hex }} aria-hidden="true" />
      <div className="relative z-[2] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[length:var(--vestara-font-size-base)] font-semibold text-[var(--vestara-text-primary)]">
            {template.name}
          </h3>
          <p className="mt-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            /{template.packageName} · v{template.version}
          </p>
        </div>
        <span
          className="grid size-8 shrink-0 place-items-center rounded border border-[var(--vestara-border-subtle)] text-[length:var(--vestara-font-size-base)]"
          style={{ backgroundColor: palette.hex, color: 'var(--vestara-surface-canvas)' }}
          aria-hidden="true"
        >
          {template.glyph}
        </span>
      </div>

      <p className="relative z-[2] text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
        {template.description}
      </p>

      <div className="relative z-[2] flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 py-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
          <span
            className="size-2 rounded-full border border-[var(--vestara-border-subtle)]"
            style={{ backgroundColor: palette.hex }}
            aria-hidden="true"
          />
          {palette.label}
        </span>
        <span className="rounded-full border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 py-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
          {font.label}
        </span>
        <span className="rounded-full border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 py-0.5 text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
          {weight.label} · {weight.value}
        </span>
      </div>

      <div
        className="relative z-[2] rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-3"
        style={{ fontFamily: font.stack, fontWeight: weight.value }}
      >
        <span className="text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)]">
          {template.name} — Aa Bb Cc 0123
        </span>
      </div>

      <div className="relative z-[2] flex items-center gap-1.5">
        {template.surfaces.map((swatch) => (
          <span
            key={swatch.name}
            className="h-4 flex-1 rounded border border-[var(--vestara-border-subtle)]"
            style={{ background: swatch.token }}
            title={`${swatch.name} · ${swatch.token}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </article>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function Templates() {
  const navigate = useNavigate();
  const handleNavigate: NavigateHandler = useCallback(
    (to, event) => {
      event.preventDefault();
      navigate(to);
    },
    [navigate],
  );

  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketplaceClient
      .listAssets()
      .then((assetList) => {
        const themeAssets = assetList.filter((asset) => assetMatchesCategory(asset, 'theme'));
        if (themeAssets.length === 0) {
          setAssets(TEMPLATE_FIXTURE_ASSETS);
          setUsingFixtures(true);
        } else {
          setAssets(themeAssets);
          setUsingFixtures(false);
        }
      })
      .catch(() => {
        setAssets(TEMPLATE_FIXTURE_ASSETS);
        setUsingFixtures(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const displayByPackage = useMemo(() => {
    const map = new Map<string, DiscoverDisplayMeta>();
    for (const fixture of THEME_TEMPLATE_FIXTURES) map.set(fixture.asset.packageName, fixture.display);
    for (const asset of assets) {
      if (!map.has(asset.packageName)) map.set(asset.packageName, displayForLiveAsset(asset));
    }
    return map;
  }, [assets]);

  return (
    <MarketplacePage
      title="Templates"
      description="Theme templates merging the extracted Shell Foundation palette with your accent, font family, and font weight."
      hideHeader
    >
      <div className="flex flex-wrap items-center gap-2" aria-label="Theme template summary">
        <MarketplaceStatPill label="Templates" value={TEMPLATE_COUNT} />
        <MarketplaceStatPill label="Accents" value={Object.keys(ACCENT_PALETTES).length} />
        <MarketplaceStatPill label="Fonts" value={FONT_FAMILY_IDS.length} />
        <MarketplaceStatPill label="Weights" value={FONT_WEIGHT_IDS.length} />
        {usingFixtures && !loading && <MarketplaceStatPill label="Reference examples" value="●" />}
      </div>

      <MarketplaceSection title="Appearance">
        <AppearanceAxes />
      </MarketplaceSection>

      <MarketplaceSection
        title="Theme templates"
        action={<span className="mpg-cat-count">{THEME_TEMPLATES.length} templates</span>}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {THEME_TEMPLATES.map((template, i) => (
            <TemplateCard key={template.id} template={template} index={i} />
          ))}
        </div>
      </MarketplaceSection>

      <MarketplaceSection
        title="Installable templates"
        action={
          <span className="mpg-cat-count">
            {assets.length} asset{assets.length === 1 ? '' : 's'}
            {usingFixtures ? ' · reference examples' : ''}
          </span>
        }
      >
        {loading ? (
          <AssetGridSkeleton count={6} />
        ) : assets.length === 0 ? (
          <MarketplaceEmptyState message="No theme templates available yet." />
        ) : (
          <div className="mpg-all-grid">
            {assets.map((asset, i) => {
              const display = displayByPackage.get(asset.packageName);
              return (
                <AssetCard
                  key={asset.id}
                  to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                  onNavigate={handleNavigate}
                  displayName={asset.displayName}
                  packageName={asset.packageName}
                  publisherId={asset.publisherId}
                  type={asset.type}
                  summary={asset.summary}
                  tags={asset.tags}
                  latestVersion={asset.latestVersion}
                  verified={asset.verification.checksumVerified}
                  index={i}
                  rating={display?.rating}
                  reviews={display?.reviews}
                  installs={display?.installs}
                  glyph={display?.glyph}
                  accentOverride={display?.accent}
                />
              );
            })}
          </div>
        )}
      </MarketplaceSection>
    </MarketplacePage>
  );
}
