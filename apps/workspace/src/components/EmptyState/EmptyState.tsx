import type { FC, ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: ReactNode;
}

const EmptyState: FC<EmptyStateProps> = ({ title, description, action, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-surface) border border-(--vestara-accent-border) rounded-lg text-center px-6 shadow-[0_0_0_1px_var(--vestara-accent-bg),0_0_12px_color-mix(in_srgb,var(--vestara-accent)_10%,transparent)]">
      {icon ? (
        <div className="mb-3 text-zinc-600">{icon}</div>
      ) : (
        <div className="text-3xl mb-3 opacity-20 text-zinc-500">◌</div>
      )}
      <h3 className="text-sm font-medium text-zinc-400 mb-1">{title}</h3>
      <p className="text-xs text-zinc-600 max-w-md mb-4">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-xs px-4 py-1.5 bg-(--vestara-surface) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-[color-mix(in_srgb,var(--vestara-accent)_10%,transparent)] hover:text-(--vestara-text) hover:border-(--vestara-accent-border-hover) transition-colors cursor-pointer font-medium shadow-[0_0_8px_var(--vestara-accent-bg)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
