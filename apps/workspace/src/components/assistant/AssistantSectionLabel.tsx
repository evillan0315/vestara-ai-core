/**
 * AssistantSectionLabel — the uppercase section heading shared by every
 * interactive response block.
 *
 * Extracted into its own module so `AssistantResponseBlocks` and
 * `AssistantSuggestedSteps` can share one definition without importing each
 * other (which would be circular).
 */

export function SectionLabel({ children }: { readonly children: string }) {
  return (
    <span className="text-(--vestara-font-size-caption) font-semibold uppercase tracking-wider text-(--vestara-text-muted)">
      {children}
    </span>
  );
}
