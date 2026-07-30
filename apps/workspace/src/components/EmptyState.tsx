interface EmptyStateProps {
  title: string;
  detail?: string;
}

export default function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div className="p-6 text-center border border-dashed border-(--vestara-accent-border) rounded-lg">
      <p className="text-sm font-semibold text-(--vestara-text-2)">{title}</p>
      {detail && <p className="text-xs text-zinc-600 mt-1">{detail}</p>}
    </div>
  );
}
