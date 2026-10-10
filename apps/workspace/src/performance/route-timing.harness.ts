import type { Page } from '@playwright/test';

export interface RouteTimingOptions {
  readonly settleMs?: number;
  readonly waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle';
}

export interface RouteTimingResult {
  readonly path: string;
  readonly navigation: {
    readonly startTime: number;
    readonly domContentLoaded: number;
    readonly load: number;
    readonly duration: number;
  } | null;
  readonly lcp: number | null;
  readonly requests: readonly string[];
}

/** Capture route-level navigation, LCP, and fetch/request activity. */
export async function measureRoute(
  page: Page,
  path: string,
  options: RouteTimingOptions = {},
): Promise<RouteTimingResult> {
  const requests: string[] = [];
  const onRequest = (request: { url(): string }): void => {
    requests.push(request.url());
  };
  page.on('request', onRequest);

  try {
    await page.goto(path, { waitUntil: options.waitUntil ?? 'load' });
    if (options.settleMs) await page.waitForTimeout(options.settleMs);

    return await page.evaluate(
      ({ route, capturedRequests }) => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const largestContentfulPaint = performance.getEntriesByType('largest-contentful-paint').at(-1);
        return {
          path: route,
          navigation: navigation
            ? {
                startTime: navigation.startTime,
                domContentLoaded: navigation.domContentLoadedEventEnd,
                load: navigation.loadEventEnd,
                duration: navigation.duration,
              }
            : null,
          lcp: largestContentfulPaint?.startTime ?? null,
          requests: capturedRequests,
        };
      },
      { route: path, capturedRequests: requests },
    );
  } finally {
    page.off('request', onRequest);
  }
}
