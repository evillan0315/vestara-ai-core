/**
 * VES-OVERVIEW-001: Marketplace Spotlight Component
 *
 * Mini gallery cards on the Marketplace grammar (mpg-card, mpg-icon-box,
 * mpg-tag-pill, mpg-featured-badge, mpg-install-btn) with star ratings.
 */

import { Link } from 'react-router-dom';
import { GalleryCard, MarketplaceEmptyState } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewMarketplaceItem } from '../overview.types';
import { SectionCard } from './SectionCard';

interface MarketplaceSpotlightProps {
  items: readonly OverviewMarketplaceItem[];
}

// Gallery tile identity: Theme Builder (orange) · Git Helper (green) ·
// Test Suite Generator (violet).
const CATEGORY_TILE: Record<string, string> = {
  Customization: 'var(--vestara-marketplace-command)',
  VCS: 'var(--vestara-marketplace-provider)',
  Testing: 'var(--vestara-marketplace-agent)',
};

export function MarketplaceSpotlight({ items }: MarketplaceSpotlightProps) {
  if (items.length === 0) {
    return (
      <SectionCard title="Marketplace Spotlight" actionLabel="View All" actionHref="/marketplace" accent="var(--vestara-marketplace-primary)" index={4}>
        <MarketplaceEmptyState message="No spotlight items." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Marketplace Spotlight" actionLabel="View All" actionHref="/marketplace" accent="var(--vestara-marketplace-primary)" index={4}>
      {/* 3-across only when the column itself is wide (full-width mobile);
          inside the md/xl multi-column layout cards stack for readability. */}
      <ul className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-3">
        {items.slice(0, 3).map((item, i) => (
          <li key={item.id} className="mpg-enter" style={{ animationDelay: `${i * 50}ms` }}>
            <GalleryCard accent={CATEGORY_TILE[item.category] ?? 'var(--vestara-marketplace-primary)'} className="h-full">
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mpg-icon-box text-white"
                    style={{
                      background: CATEGORY_TILE[item.category] ?? 'var(--vestara-marketplace-primary)',
                      borderColor: 'transparent',
                      boxShadow: `0 0 12px color-mix(in srgb, ${CATEGORY_TILE[item.category] ?? 'var(--vestara-marketplace-primary)'} 40%, transparent)`,
                      width: '2rem',
                      height: '2rem',
                      fontSize: '0.85rem',
                      borderRadius: '0.5rem',
                    }}
                  >
                    ⬢
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-[var(--vestara-text-primary)]">{item.name}</span>
                    <span className="mpg-tag-pill mt-1">{item.category}</span>
                  </span>
                  {i === 0 && <span className="mpg-featured-badge">★ Featured</span>}
                </div>
                <p className="line-clamp-2 min-h-[28px] text-[10.5px] leading-snug text-[var(--vestara-text-muted)]">
                  {item.description ?? item.category}
                </p>
                <p className="text-[10.5px] font-semibold text-[var(--vestara-marketplace-rating)]" style={{ filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--vestara-marketplace-rating) 40%, transparent))' }}>
                  ★ {item.rating?.toFixed(1) ?? '—'} <span className="font-normal text-[var(--vestara-text-muted)]">({item.ratingCount ?? 0})</span>
                </p>
                <Link
                  to="/marketplace"
                  className="mpg-install-btn mt-auto"
                >
                  {item.installed ? '✓ Installed' : 'Install'}
                </Link>
              </div>
            </GalleryCard>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
