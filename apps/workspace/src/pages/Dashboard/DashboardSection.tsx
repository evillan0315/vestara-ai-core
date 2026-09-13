import type { ReactNode } from 'react';
import { SectionCard } from '../../features/overview/components/SectionCard';

export interface DragSectionProps {
  id: string;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface DashboardSectionProps {
  title: string;
  icon?: string;
  dragSection: DragSectionProps;
  children: ReactNode;
}

export default function DashboardSection({ title, icon, dragSection, children }: DashboardSectionProps) {
  return (
    <div
      className={`${dragSection?.isDragOver ? 'rounded-lg ring-2 ring-dashed ring-accent' : ''}`}
      onDragOver={dragSection?.onDragOver}
      onDragLeave={dragSection?.onDragLeave}
      onDrop={dragSection?.onDrop}
    >
      <SectionCard title={`${icon ? `${icon} ` : ''}${title}`} accent="var(--vestara-accent)">
        <span
          draggable
          onDragStart={dragSection.onDragStart}
          onDragEnd={dragSection.onDragEnd}
          className="mb-2 inline-block cursor-grab rounded px-0.5 py-1 text-xs leading-none text-zinc-600 opacity-40 transition-colors select-none hover:bg-zinc-800/50 hover:text-zinc-300 hover:opacity-100 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <span aria-hidden="true">⠿</span>
        </span>
        {children}
      </SectionCard>
    </div>
  );
}
