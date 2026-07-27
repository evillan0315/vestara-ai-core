interface EmptyStateProps {
  title: string;
  detail?: string;
}

export default function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div className="p-6 text-center border border-dashed border-zinc-800 rounded-lg">
      <p className="text-sm font-semibold text-zinc-500">{title}</p>
      {detail && <p className="text-xs text-zinc-600 mt-1">{detail}</p>}
    </div>
  );
}
