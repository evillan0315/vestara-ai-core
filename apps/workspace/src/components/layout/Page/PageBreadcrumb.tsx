import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function PageBreadcrumb({ items }: PageBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1 overflow-x-auto text-sm whitespace-nowrap">
      {items.map((item, index) => {
        const last = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="flex items-center">
            {last ? (
              <span className="font-medium text-zinc-200">{item.label}</span>
            ) : (
              <a href={item.href} className="text-zinc-500 transition-colors hover:text-zinc-200">
                {item.label}
              </a>
            )}

            {!last && <ChevronRightRoundedIcon fontSize="inherit" className="mx-1 text-zinc-700" />}
          </div>
        );
      })}
    </nav>
  );
}
