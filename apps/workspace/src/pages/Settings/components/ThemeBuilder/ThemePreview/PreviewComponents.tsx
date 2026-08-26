import { useState } from 'react';
import type { ReactNode } from 'react';

const surface = 'border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]';
const raised = 'bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]';
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset';
const input = `min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] ${focus}`;
const textPrimary = 'text-[var(--vestara-color-text-primary,var(--vestara-text))]';
const textSecondary = 'text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]';
const textMuted = 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]';
const textDim = 'text-[var(--vestara-color-text-dim,var(--color-zinc-500))]';
const borderDefault = 'border-[var(--vestara-color-border-default,var(--color-zinc-700))]';
const borderSubtle = 'border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]';
const accentBg = 'bg-[var(--vestara-accent-bg)]';
const accentBorder = 'border-[var(--vestara-accent-border)]';
const accentText = 'text-[var(--vestara-accent-text)]';
const accent = 'bg-[var(--vestara-accent)]';
const accentHover = 'hover:bg-[var(--vestara-accent-light)]';
const accentDark = 'bg-[var(--vestara-accent-dark)]';
const accentBorderHover = 'hover:border-[var(--vestara-accent-border-hover)]';
const transition = 'transition-colors motion-reduce:transition-none';
const radius = 'rounded-[var(--vestara-radius)]';
const radiusLg = 'rounded-[var(--vestara-radius-lg)]';
const radiusFull = 'rounded-[var(--vestara-radius-full)]';
const shadowMd = 'shadow-[0_4px_6px_rgba(0,0,0,0.1)]';
const shadowLg = 'shadow-[0_10px_15px_rgba(0,0,0,0.1)]';

function StatusBadge({ label, variant }: { label: string; variant: string }) {
  const variants: Record<string, string> = {
    success: 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)] text-[var(--vestara-green)]',
    warning: 'border-[color-mix(in_srgb,var(--vestara-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-amber)_9%,transparent)] text-[var(--vestara-amber)]',
    error: 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)] text-[var(--vestara-red)]',
    info: 'border-[color-mix(in_srgb,var(--vestara-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-blue)_9%,transparent)] text-[var(--vestara-blue)]',
    unavailable: 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]',
    disabled: 'border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-interactive,var(--color-zinc-800))] text-[var(--vestara-color-text-dim,var(--color-zinc-500))]',
    auth: 'border-[color-mix(in_srgb,var(--vestara-purple)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-purple)_9%,transparent)] text-[var(--vestara-purple)]',
    approval: 'border-[color-mix(in_srgb,#fb7185_35%,transparent)] bg-[color-mix(in_srgb,#fb7185_9%,transparent)] text-[#fb7185]',
    conflict: 'border-[color-mix(in_srgb,#fbbf24_35%,transparent)] bg-[color-mix(in_srgb,#fbbf24_9%,transparent)] text-[#fbbf24]',
    saving: 'border-[color-mix(in_srgb,var(--vestara-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-blue)_9%,transparent)] text-[var(--vestara-blue)]',
    saved: 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)] text-[var(--vestara-green)]',
    failed: 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)] text-[var(--vestara-red)]',
    blocked: 'border-[color-mix(in_srgb,var(--vestara-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-amber)_9%,transparent)] text-[var(--vestara-amber)]',
    pending: 'border-[color-mix(in_srgb,var(--vestara-purple)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-purple)_9%,transparent)] text-[var(--vestara-purple)]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 ${radiusFull} border px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium ${variants[variant] || variants.unavailable}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Button({ children, variant = 'primary', disabled, className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; className?: string }) {
  const variants = {
    primary: `border-[var(--vestara-accent-dark)] ${accent} text-[var(--color-zinc-950)] ${accentHover}`,
    secondary: `border-[var(--vestara-color-border-default,var(--color-zinc-700))] ${raised} ${textSecondary} ${accentBorderHover} hover:${textPrimary}`,
    ghost: `border-transparent ${textSecondary} hover:${accentBg} hover:${textPrimary}`,
    danger: `border-[var(--vestara-red)] bg-[color-mix(in_srgb,var(--vestara-red)_10%,transparent)] text-[var(--vestara-red)] hover:bg-[color-mix(in_srgb,var(--vestara-red)_20%,transparent)]`,
  };
  return (
    <button
      type="button"
      disabled={disabled}
      className={`min-h-9 ${radius} border px-3 text-[var(--vestara-font-size-sm)] font-medium ${transition} disabled:cursor-not-allowed disabled:opacity-40 ${focus} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Input({ type = 'text', placeholder, value, onChange, className = '' }: { type?: string; placeholder?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`${input} ${className}`}
    />
  );
}

function Select({ options, value, onChange, className = '' }: { options: { value: string; label: string }[]; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; className?: string }) {
  return (
    <select value={value} onChange={onChange} className={`${input} ${className}`}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function Textarea({ placeholder, value, onChange, className = '' }: { placeholder?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; className?: string }) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`${input} min-h-[80px] resize-y ${className}`}
    />
  );
}

function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={`size-4 ${radius} border-[var(--vestara-color-border-default,var(--color-zinc-700))] ${raised} text-[var(--vestara-accent)] ${focus} accent-[var(--vestara-accent)] disabled:cursor-not-allowed disabled:opacity-40`}
      />
      <span className={textSecondary}>{label}</span>
    </label>
  );
}

function Radio({ label, checked, onChange, name, disabled }: { label: string; checked: boolean; onChange: () => void; name: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={`size-4 ${radiusFull} border-[var(--vestara-color-border-default,var(--color-zinc-700))] ${raised} text-[var(--vestara-accent)] ${focus} accent-[var(--vestara-accent)] disabled:cursor-not-allowed disabled:opacity-40`}
      />
      <span className={textSecondary}>{label}</span>
    </label>
  );
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative h-6 w-10 ${radiusFull} border ${transition} ${focus} ${checked ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent)]' : 'border-[var(--vestara-color-border-strong,var(--color-zinc-600))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <span className={`absolute top-0.5 size-4 ${radiusFull} bg-[var(--color-zinc-50)] shadow ${transition} ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
      <span className={textSecondary}>{label}</span>
    </label>
  );
}

function Card({ title, children, variant = 'default', className = '' }: { title?: string; children: ReactNode; variant?: 'default' | 'hover' | 'active' | 'selected'; className?: string }) {
  const variants = {
    default: `${surface} ${shadowMd}`,
    hover: `${surface} ${shadowMd} ${transition} hover:${shadowLg} hover:border-[var(--vestara-accent-border-hover)]`,
    active: `${surface} ${shadowMd} border-[var(--vestara-accent-border)] ${accentBg}`,
    selected: `${surface} ${shadowMd} border-2 border-[var(--vestara-accent)] ${accentBg}`,
  };
  return (
    <div className={`${radiusLg} p-4 ${variants[variant]} ${className}`}>
      {title && <h3 className="mb-3 text-[var(--vestara-font-size-base)] font-semibold ${textPrimary}">{title}</h3>}
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className={`${radiusLg} ${raised} ${borderSubtle} p-4 overflow-x-auto text-[var(--vestara-font-size-xs)] font-mono ${textSecondary}`}>
      <code>{children}</code>
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[var(--vestara-font-size-sm)]">
        <thead>
          <tr className={`${borderSubtle} ${textMuted} uppercase tracking-wider text-[var(--vestara-font-size-xs)]`}>
            {headers.map((h) => (
              <th key={h} className="pb-2 px-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className={`${textPrimary} divide-y divide-[var(--vestara-color-border-subtle,var(--color-zinc-800))]`}>
          {rows.map((row, i) => (
            <tr key={i} className={`${transition} hover:bg-[var(--vestara-color-bg-hover,var(--color-zinc-800))]`}>
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Toast({ title, description, variant = 'info' }: { title: string; description?: string; variant?: 'success' | 'error' | 'info' | 'loading' }) {
  const variants = {
    success: 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)]',
    error: 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)]',
    info: 'border-[color-mix(in_srgb,var(--vestara-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-blue)_9%,transparent)]',
    loading: 'border-[color-mix(in_srgb,var(--vestara-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-amber)_9%,transparent)]',
  };
  return (
    <div className={`${radiusLg} border p-4 ${shadowLg} ${variants[variant]} ${transition}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {variant === 'success' && (
            <svg className="size-5 text-[var(--vestara-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          )}
          {variant === 'error' && (
            <svg className="size-5 text-[var(--vestara-red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          )}
          {variant === 'info' && (
            <svg className="size-5 text-[var(--vestara-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {variant === 'loading' && (
            <svg className="size-5 text-[var(--vestara-amber)] animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium ${textPrimary}">{title}</p>
          {description && <p className="mt-0.5 text-[var(--vestara-font-size-sm)] ${textSecondary}">{description}</p>}
        </div>
      </div>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children, footer }: { isOpen: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={`${radiusLg} ${surface} ${shadowLg} w-full max-w-lg relative z-10 ${transition} motion-reduce:transition-none`}>
        <div className="flex items-center justify-between border-b ${borderSubtle} px-4 py-3">
          <h2 id="modal-title" className="text-[var(--vestara-font-size-base)] font-semibold ${textPrimary}">{title}</h2>
          <button onClick={onClose} className="p-1 ${textMuted} hover:${textPrimary} ${transition} ${radius}" aria-label="Close">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4">${children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t ${borderSubtle} px-4 py-3">${footer}</div>}
      </div>
    </div>
  );
}

export function PreviewComponents() {
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div className="p-6 space-y-8" style={{ fontFamily: 'var(--vestara-font-family)' }}>
      <style jsx global>{`
        * {
          --vestara-font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          --vestara-font-size-base: 14.25px;
          --vestara-font-size-sm: 12.25px;
          --vestara-font-size-xs: 10.75px;
          --vestara-font-size-lg: 16.25px;
          --vestara-font-weight-normal: 400;
          --vestara-font-weight-medium: 500;
          --vestara-font-weight-semibold: 600;
          --vestara-radius: 6px;
          --vestara-radius-lg: 8px;
          --vestara-radius-full: 9999px;
          --vestara-spacing-page: 1rem;
          --vestara-spacing-section: 0.75rem;
          --vestara-spacing-element: 0.375rem;
          --vestara-sidebar-width: 240px;
          --vestara-page-max-width: 1280px;
          --vestara-motion-fast: 150ms;
          --vestara-motion-normal: 200ms;
          --vestara-motion-slow: 300ms;
          --vestara-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
          --vestara-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
          --vestara-shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
        }
      `}</style>

      {/* Header */}
      <section aria-labelledby="header-title">
        <h2 id="header-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Header & Navigation</h2>
        <header className={`flex items-center justify-between ${borderSubtle} ${radiusLg} px-4 py-3 ${surface}`}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 ${accentBg} ${accentBorder} ${radius} px-3 py-1.5">
              <span className="text-[var(--vestara-font-size-xs)] font-semibold ${accentText}">VDS</span>
            </div>
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {['Dashboard', 'Agents', 'Activity', 'Settings'].map((item) => (
                <button key={item} className={`px-3 py-1.5 text-[var(--vestara-font-size-sm)] ${radius} ${transition} hover:${accentBg} hover:${textPrimary} ${textMuted}`}>{item}</button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Input type="search" placeholder="Search..." className="w-64 pl-8" />
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 size-4 ${textMuted}" fill="none" stroke="currentColor" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
            </div>
            <div className="flex items-center gap-2 pl-3 border-l ${borderSubtle}">
              <StatusBadge label="Online" variant="success" />
              <button className={`flex items-center gap-2 ${radius} px-2 py-1 ${transition} hover:${accentBg} ${textSecondary}`}>
                <div className="size-8 ${radiusFull} ${accentBg} ${accentBorder} flex items-center justify-center">
                  <span className="text-[var(--vestara-font-size-xs)] font-medium ${accentText}">U</span>
                </div>
              </button>
            </div>
          </div>
        </header>
      </section>

      {/* Sidebar */}
      <section aria-labelledby="sidebar-title">
        <h2 id="sidebar-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Sidebar Navigation</h2>
        <div className={`${surface} ${radiusLg} p-3 max-w-xs`}>
          <nav aria-label="Sidebar navigation">
            <ul className="space-y-1" role="list">
              {[
                { label: 'Dashboard', active: true },
                { label: 'Agents', active: false },
                { label: 'Activity', active: false, badge: '3' },
                { label: 'Sessions', active: false },
                { label: 'Settings', active: false, disabled: true },
              ].map((item) => (
                <li key={item.label}>
                  <button
                    disabled={item.disabled}
                    className={`w-full flex items-center justify-between px-3 py-2 ${radius} ${transition} text-left ${item.active ? `${accentBg} ${accentBorder} ${accentText} font-medium` : `${textSecondary} hover:${accentBg} hover:${textPrimary}`} ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span>{item.label}</span>
                    {item.badge && <span className={`${radiusFull} ${accentBg} ${accentBorder} px-1.5 text-[10px] font-medium ${accentText}`}>{item.badge}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* Card Grid */}
      <section aria-labelledby="cards-title">
        <h2 id="cards-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Card Grid</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Default Card">
            <p className={textSecondary}>Standard card with default styling</p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm">Primary</Button>
              <Button variant="secondary" size="sm">Secondary</Button>
            </div>
          </Card>
          <Card title="Hover State" variant="hover">
            <p className={textSecondary}>Card with hover elevation</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm">Action</Button>
            </div>
          </Card>
          <Card title="Active State" variant="active">
            <p className={textSecondary}>Card in active/pressed state</p>
            <StatusBadge label="Active" variant="success" />
          </Card>
          <Card title="Selected State" variant="selected">
            <p className={textSecondary}>Card with selection border</p>
            <StatusBadge label="Selected" variant="info" />
          </Card>
        </div>
      </section>

      {/* Form Inputs */}
      <section aria-labelledby="forms-title">
        <h2 id="forms-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Form Inputs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="Text Input">
            <Input placeholder="Enter text..." className="w-full" />
            <p className="mt-2 text-[var(--vestara-font-size-xs)] ${textMuted}">Standard text input</p>
          </Card>
          <Card title="Select">
            <Select
              value="option1"
              onChange={() => {}}
              options={[{ value: 'option1', label: 'Option 1' }, { value: 'option2', label: 'Option 2' }, { value: 'option3', label: 'Option 3' }]}
              className="w-full"
            />
            <p className="mt-2 text-[var(--vestara-font-size-xs)] ${textMuted}">Native select dropdown</p>
          </Card>
          <Card title="Textarea">
            <Textarea placeholder="Enter description..." className="w-full" />
            <p className="mt-2 text-[var(--vestara-font-size-xs)] ${textMuted}">Multi-line text input</p>
          </Card>
          <Card title="Checkbox">
            <div className="space-y-2">
              <Checkbox label="Enable feature" checked={true} onChange={() => {}} />
              <Checkbox label="Disable option" checked={false} onChange={() => {}} />
              <Checkbox label="Disabled checkbox" checked={false} onChange={() => {}} disabled />
            </div>
          </Card>
          <Card title="Radio Group">
            <div className="space-y-2">
              <Radio label="Option A" checked={true} onChange={() => {}} name="radio-group" />
              <Radio label="Option B" checked={false} onChange={() => {}} name="radio-group" />
              <Radio label="Option C (disabled)" checked={false} onChange={() => {}} name="radio-group" disabled />
            </div>
          </Card>
          <Card title="Switch">
            <div className="space-y-2">
              <Switch label="Enable notifications" checked={true} onChange={() => {}} />
              <Switch label="Auto-save" checked={false} onChange={() => {}} />
              <Switch label="Disabled switch" checked={false} onChange={() => {}} disabled />
            </div>
          </Card>
        </div>
      </section>

      {/* Buttons */}
      <section aria-labelledby="buttons-title">
        <h2 id="buttons-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Buttons</h2>
        <Card>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="flex items-center text-[var(--vestara-font-size-sm)] ${textMuted}">With icons:</span>
            <Button variant="primary"><svg className="mr-1.5 size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Create</Button>
            <Button variant="secondary"><svg className="mr-1.5 size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download</Button>
            <Button variant="ghost"><svg className="mr-1.5 size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>View</Button>
          </div>
        </Card>
      </section>

      {/* Status Badges */}
      <section aria-labelledby="badges-title">
        <h2 id="badges-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Status Badges</h2>
        <Card>
          <div className="flex flex-wrap gap-2">
            {[
              'success', 'warning', 'error', 'info',
              'unavailable', 'disabled', 'auth', 'approval',
              'conflict', 'saving', 'saved', 'failed', 'blocked', 'pending'
            ].map((variant) => (
              <StatusBadge key={variant} label={variant.charAt(0).toUpperCase() + variant.slice(1)} variant={variant} />
            ))}
          </div>
        </Card>
      </section>

      {/* Data Table */}
      <section aria-labelledby="table-title">
        <h2 id="table-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Data Table</h2>
        <Card>
          <Table
            headers={['Name', 'Status', 'Type', 'Last Updated', 'Actions']}
            rows={[
              ['Agent-001', 'Running', 'Worker', '2 min ago', 'View'],
              ['Agent-002', 'Idle', 'Manager', '1 hr ago', 'Start'],
              ['Agent-003', 'Error', 'Worker', '5 min ago', 'Restart'],
              ['Agent-004', 'Pending', 'Worker', 'Just now', 'Wait'],
            ]}
          />
        </Card>
      </section>

      {/* Code Block */}
      <section aria-labelledby="code-title">
        <h2 id="code-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Code Block</h2>
        <Card>
          <CodeBlock>{`function themeBuilder(tokens) {
  const theme = {
    colors: tokens.colorTokens,
    spacing: tokens.spacingTokens,
    radius: tokens.radiusTokens,
  };
  
  return applyTheme(theme);
}

// Apply to preview iframe
previewIframe.contentDocument.documentElement.style
  .setProperty('--vestara-accent', theme.colors.accent);`}</CodeBlock>
        </Card>
      </section>

      {/* Toast Notifications */}
      <section aria-labelledby="toasts-title">
        <h2 id="toasts-title" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Toast Notifications</h2>
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 max-w-sm" aria-live="polite" aria-label="Notifications">
          <Toast title="Operation successful" description="Your theme has been saved" variant="success" />
          <Toast title="Error occurred" description="Failed to connect to server" variant="error" />
          <Toast title="Information" description="New version available" variant="info" />
          <Toast title="Saving changes..." description="Please wait" variant="loading" />
        </div>
        <Card>
          <p className={textMuted}>Toasts appear in bottom-right corner. Shown here inline for preview.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Toast title="Success" description="Theme applied" variant="success" />
            <Toast title="Error" description="Connection failed" variant="error" />
            <Toast title="Info" description="Update available" variant="info" />
            <Toast title="Loading" description="Processing..." variant="loading" />
          </div>
        </Card>
      </section>

      {/* Modal/Dialog */}
      <section aria-labelledby="modal-title-heading">
        <h2 id="modal-title-heading" className="mb-4 text-[var(--vestara-font-size-lg)] font-semibold ${textPrimary}">Modal Dialog</h2>
        <Card>
          <div className="flex gap-3">
            <Button variant="primary" onClick={() => setModalOpen(true)}>Open Modal</Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Open Confirm Dialog</Button>
          </div>
          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Confirm Action"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Confirm</Button>
              </>
            }
          >
            <p className={textSecondary}>Are you sure you want to apply this theme? This will update all workspace surfaces with the new token values.</p>
          </Modal>
        </Card>
      </section>
    </div>
  );
}