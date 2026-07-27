import type { ReactNode } from 'react';
import Section from '../../components/dashboard/Section';

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
    <Section title={title} icon={icon} accent="var(--vestara-accent)" dragSection={dragSection}>
      {children}
    </Section>
  );
}
