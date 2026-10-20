/**
 * VES-UI-001 T5: Marketplace Package Data Hook
 *
 * API first (marketplace index via `marketplaceClient.search` + `installed`)
 * → `marketplacePackageFixture`. Never hardcoded arrays in JSX.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Marketplace)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useCallback, useEffect, useState } from 'react';
import { marketplaceClient } from '../../../lib/marketplace';
import { type MarketplacePackageItem, marketplacePackageFixture } from './packages.fixtures';

export interface UseMarketplacePackageReturn {
  readonly items: readonly MarketplacePackageItem[];
  readonly isLoading: boolean;
  readonly isLive: boolean;
  readonly refetch: () => Promise<void>;
}

export function useMarketplacePackage(): UseMarketplacePackageReturn {
  const [items, setItems] = useState<readonly MarketplacePackageItem[]>(marketplacePackageFixture);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [searchResult, installedList] = await Promise.all([
        marketplaceClient.search({ limit: 6 }),
        marketplaceClient.installed().catch(() => []),
      ]);
      if (searchResult.items.length > 0) {
        const installedNames = new Set(installedList.map((entry) => entry.packageName));
        setItems(
          searchResult.items.map((hit) => ({
            id: hit.asset.id,
            name: hit.asset.displayName,
            category: hit.asset.type,
            description: hit.asset.summary,
            installed: installedNames.has(hit.asset.packageName),
          })),
        );
        setIsLive(true);
        return;
      }
      setItems(marketplacePackageFixture);
      setIsLive(false);
    } catch {
      setItems(marketplacePackageFixture);
      setIsLive(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { items, isLoading, isLive, refetch: fetchData };
}
