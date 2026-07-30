interface PaginationProps {
  current: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({ current, total, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-3">
      <button onClick={() => onChange(Math.max(1, current - 1))} disabled={current <= 1}
        className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
        Prev
      </button>
      {pages.map((p, i) => (
        typeof p === 'number' ? (
          <button key={i} onClick={() => onChange(p)}
            className={`text-[9px] min-w-[22px] px-1.5 py-1 rounded transition-colors cursor-pointer ${
              p === current
                ? 'bg-(--vestara-accent) text-white font-medium'
                : 'bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text)'
            }`}>
            {p}
          </button>
        ) : (
          <span key={i} className="text-[9px] px-1 text-(--vestara-text-dim)">...</span>
        )
      ))}
      <button onClick={() => onChange(Math.min(totalPages, current + 1))} disabled={current >= totalPages}
        className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
        Next
      </button>
    </div>
  );
}
