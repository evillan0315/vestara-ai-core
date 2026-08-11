/**
 * Opportunity Registry — stable grouping keys.
 *
 * A discovery signature is derived from category + a normalized subject, so the
 * same underlying discovery observed by different agents (developer, reviewer,
 * verifier) converges to one opportunity.
 */

export function opportunityKeyFor(category: string, subject: string): string {
  const normalized = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return `${category.trim().toLowerCase()}:${normalized || 'unspecified'}`;
}
