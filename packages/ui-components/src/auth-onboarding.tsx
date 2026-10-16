/**
 * @vestara/ui-components — Auth & onboarding primitives.
 *
 * Extracted from the VESTARA AI_OS login/onboarding reference artifact.
 * The AI_OS appearance is a white-on-near-black system; the binary inks
 * resolve through `--vestara-color-os-inverse` / `--vestara-color-os-on-accent`
 * so no component carries a raw `bg-white` / `text-black` literal.
 */

import { type ComponentType, createElement, type ReactNode } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Lock,
  Puzzle,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Usb,
} from './icons.js';
import { cn } from './utils.js';

// ─── Types ─────────────────────────────────────────────────────

export type IconRenderer = ComponentType<{ className?: string }>;

export type AuthMethod = 'passphrase' | 'hardware' | 'recovery';
export type HardwareStatus = 'idle' | 'scanning' | 'found';
export type ConnectionStatus = 'idle' | 'testing' | 'ok' | 'fail';

// ─── MethodTabs ────────────────────────────────────────────────

export interface MethodTabsProps {
  value: AuthMethod;
  onChange: (value: AuthMethod) => void;
  onTracer?: (value: AuthMethod) => void;
}

const METHODS: readonly { id: AuthMethod; label: string; icon: IconRenderer }[] = [
  { id: 'passphrase', label: 'Passphrase', icon: Lock },
  { id: 'hardware', label: 'Hardware Key', icon: Usb },
  { id: 'recovery', label: 'Recovery', icon: KeyRound },
];

export function MethodTabs({ value, onChange, onTracer }: MethodTabsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-[14px] border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/40 p-1">
      {METHODS.map((method) => (
        <button
          key={method.id}
          type="button"
          aria-pressed={value === method.id}
          onClick={() => {
            onChange(method.id);
            onTracer?.(method.id);
          }}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 font-mono text-[11px] transition-all active:scale-[0.97]',
            value === method.id
              ? 'bg-[var(--vestara-color-os-inverse)] font-medium text-[var(--vestara-color-os-auth-canvas)]'
              : 'text-[var(--vestara-text-os-secondary)] hover:bg-[var(--vestara-color-os-inverse)]/[0.06] hover:text-[var(--vestara-color-os-inverse)]',
          )}
        >
          {createElement(method.icon, { className: 'h-3.5 w-3.5' })} {method.label}
        </button>
      ))}
    </div>
  );
}

// ─── TracerBadge ───────────────────────────────────────────────

export interface TracerBadgeProps {
  method?: string;
  ts?: string;
}

export function TracerBadge({ method, ts }: TracerBadgeProps) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-accent-os-cyan)]/10 px-2.5 py-1 font-mono text-[10px] text-[var(--vestara-accent-os-cyan)]">
      <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--vestara-accent-os-cyan)]" />
      {method ? `✓ ${method} • ${ts ?? 'now'}` : 'ready • click a method to see tracer'}
    </div>
  );
}

// ─── PassphraseInput ───────────────────────────────────────────

export interface PassphraseInputProps {
  value: string;
  onChange: (value: string) => void;
  show?: boolean;
  onToggleShow: () => void;
  label?: string;
}

export function PassphraseInput({
  value,
  onChange,
  show = false,
  onToggleShow,
  label = 'LOCAL PASSPHRASE — PRIMARY',
}: PassphraseInputProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wide text-[var(--vestara-text-os-secondary)]">{label}</span>
        <span className="rounded border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-accent-os-cyan)]/10 px-2 py-0.5 font-mono text-[9px] text-[var(--vestara-accent-os-cyan)]">
          AES-256-XTS
        </span>
      </div>
      <div className="group relative">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter OS encryption key"
          type={show ? 'text' : 'password'}
          className="h-12 w-full rounded-[12px] border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/50 px-4 pr-12 font-mono text-[13px] text-[var(--vestara-color-os-inverse)] placeholder:text-[var(--vestara-text-os-faint)] focus:border-[var(--vestara-accent-os-cyan)]/50 focus:outline-none"
        />
        <button
          type="button"
          aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[8px] text-[var(--vestara-text-os-secondary)] hover:bg-[var(--vestara-color-os-inverse)]/10"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex gap-2 font-mono text-[10px] leading-relaxed text-[var(--vestara-text-os-faint)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vestara-text-os-secondary)]" />
        Your OS encryption key — never leaves the SSD. Decrypts the local vault in RAM only.
      </div>
    </div>
  );
}

// ─── HardwareKeyCard ───────────────────────────────────────────

export interface HardwareKeyCardProps {
  status: HardwareStatus;
  onScan: () => void;
}

export function HardwareKeyCard({ status, onScan }: HardwareKeyCardProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-color-os-auth-canvas)]/30 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-accent-os-cyan)]/10 text-[var(--vestara-accent-os-cyan)]">
            <Usb className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[13px] font-medium text-[var(--vestara-color-os-inverse)]">
              Secure Boot Key Detected
            </div>
            <div className="font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">
              YubiKey 5 • FIDO2 • Slot 1
            </div>
          </div>
          <div className="ml-auto">
            {status === 'idle' && (
              <button
                type="button"
                onClick={onScan}
                className="rounded-full bg-[var(--vestara-color-os-inverse)] px-3 py-1.5 font-mono text-[11px] text-[var(--vestara-color-os-auth-canvas)]"
              >
                SCAN
              </button>
            )}
            {status === 'scanning' && (
              <span className="animate-pulse rounded-full bg-[var(--vestara-accent-os-cyan)]/10 px-3 py-1.5 font-mono text-[11px] text-[var(--vestara-accent-os-cyan)]">
                SCANNING…
              </span>
            )}
            {status === 'found' && (
              <span className="flex items-center gap-1 rounded-full border border-[var(--vestara-status-os-success)]/20 bg-[var(--vestara-status-os-success)]/15 px-3 py-1.5 font-mono text-[11px] text-[var(--vestara-status-os-success)]">
                <Check className="h-3 w-3" /> VERIFIED
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--vestara-color-os-inverse)]/10">
          <div
            className={cn(
              'h-full bg-[var(--vestara-accent-os-cyan)] transition-all duration-700',
              status === 'found' ? 'w-full' : status === 'scanning' ? 'w-[70%] animate-pulse' : 'w-0',
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ─── RecoveryGrid ──────────────────────────────────────────────

export interface RecoveryGridProps {
  words: readonly string[];
  onChange: (index: number, value: string) => void;
}

export function RecoveryGrid({ words, onChange }: RecoveryGridProps) {
  const cells = words.map((word, position) => ({
    key: `rw-${position}`,
    number: String(position + 1).padStart(2, '0'),
    position,
    word,
  }));
  return (
    <div className="space-y-3">
      <span className="font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">12-WORD RECOVERY SEED</span>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell) => (
          <div key={cell.key} className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-[var(--vestara-text-os-faint)]">
              {cell.number}
            </span>
            <input
              value={cell.word}
              onChange={(event) => onChange(cell.position, event.target.value.toLowerCase())}
              placeholder="—"
              className="h-9 w-full rounded-[8px] border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/40 pl-7 pr-2 font-mono text-[11px] text-[var(--vestara-color-os-inverse)] focus:border-[var(--vestara-accent-os-cyan)]/40 focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 rounded-[10px] border border-[var(--vestara-status-os-warning)]/20 bg-[var(--vestara-status-os-warning)]/10 p-2.5 font-mono text-[10px] text-[var(--vestara-status-os-warning)]">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        Seed never touches the network. Rebuilds the master key locally.
      </div>
    </div>
  );
}

// ─── AvatarBox ─────────────────────────────────────────────────

export interface AvatarBoxProps {
  name: string;
  colorIndex: number;
  onColorChange: (index: number) => void;
}

const AVATAR_GRADIENTS: readonly string[] = [
  'from-[var(--vestara-accent-os-cyan)] to-[#7A5CFA]',
  'from-[#FF5A8A] to-[var(--vestara-status-os-warning)]',
  'from-[var(--vestara-status-os-success)] to-[var(--vestara-accent-os-cyan)]',
  'from-[#FF7A00] to-[#FF00A8]',
];

export function AvatarBox({ name, colorIndex, onColorChange }: AvatarBoxProps) {
  const active = AVATAR_GRADIENTS[colorIndex] ?? AVATAR_GRADIENTS[0];
  return (
    <div className="space-y-4">
      <div className="font-mono text-[11px] tracking-wide text-[var(--vestara-text-os-secondary)]">AVATAR</div>
      <div className="flex flex-col items-center gap-3">
        <div className="relative grid h-[84px] w-[84px] place-items-center rounded-[22px] border border-[var(--vestara-color-os-inverse)]/10 bg-gradient-to-br from-[var(--vestara-surface-os-raised)] to-[var(--vestara-color-os-auth-canvas)]">
          <div
            className={cn(
              'grid h-[64px] w-[64px] place-items-center rounded-[16px] bg-gradient-to-br text-[24px] font-bold text-[var(--vestara-color-os-inverse)]',
              active,
            )}
          >
            {name.slice(0, 1).toUpperCase() || 'V'}
          </div>
          <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--vestara-surface-os-raised)] bg-[var(--vestara-color-os-inverse)] text-[10px] font-bold text-[var(--vestara-color-os-auth-canvas)]">
            V
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {AVATAR_GRADIENTS.map((gradient, index) => (
            <button
              key={gradient}
              type="button"
              aria-label={`Avatar colour ${index + 1}`}
              onClick={() => onColorChange(index)}
              className={cn(
                'h-8 rounded-[8px] border-2 bg-gradient-to-br transition-all',
                gradient,
                colorIndex === index
                  ? 'scale-105 border-[var(--vestara-color-os-inverse)]'
                  : 'border-transparent opacity-70 hover:opacity-100',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SeedGrid ──────────────────────────────────────────────────

export interface SeedGridProps {
  words: readonly string[];
  blurred: boolean;
  onToggleBlur: () => void;
  onCopy: () => void;
  copied?: boolean;
}

export function SeedGrid({ words, blurred, onToggleBlur, onCopy, copied }: SeedGridProps) {
  const cells = words.map((word, position) => ({
    key: `seed-${position}`,
    number: String(position + 1).padStart(2, '0'),
    word,
  }));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">
          ENCRYPTION PASSPHRASE — 12 WORD SEED
        </span>
        <button
          type="button"
          onClick={onToggleBlur}
          className="flex items-center gap-1 font-mono text-[10px] text-[var(--vestara-accent-os-cyan)] hover:underline"
        >
          {blurred ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {blurred ? 'REVEAL' : 'HIDE'}
        </button>
      </div>
      <div
        className={cn(
          'grid grid-cols-3 gap-2 rounded-[14px] border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/60 p-3 transition-all',
          blurred && 'select-none blur-[8px]',
        )}
      >
        {cells.map((cell) => (
          <div
            key={cell.key}
            className="flex h-[30px] items-center gap-1.5 rounded-[8px] border border-[var(--vestara-color-os-inverse)]/5 bg-[var(--vestara-color-os-inverse)]/[0.06] px-2 font-mono text-[11px] text-[var(--vestara-color-os-inverse)]"
          >
            <span className="text-[9px] text-[var(--vestara-text-os-faint)]">{cell.number}</span>
            <span className="font-medium">{cell.word}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-full border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-inverse)]/10 px-3 py-1.5 font-mono text-[11px] text-[var(--vestara-color-os-inverse)] hover:bg-[var(--vestara-color-os-inverse)]/15"
        >
          {copied ? 'COPIED ✓' : 'COPY SEED'}
        </button>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--vestara-status-os-warning)]">
          <TriangleAlert className="h-3 w-3" /> Never share.
        </span>
      </div>
    </div>
  );
}

// ─── DisplayNameInput ──────────────────────────────────────────

export interface DisplayNameInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DisplayNameInput({ value, onChange, placeholder = 'Your builder name' }: DisplayNameInputProps) {
  return (
    <div>
      <span className="font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">DISPLAY NAME</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-[12px] border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/50 px-4 text-[14px] text-[var(--vestara-color-os-inverse)] focus:border-[var(--vestara-accent-os-cyan)]/50 focus:outline-none"
      />
    </div>
  );
}

// ─── StorageOptionCard ─────────────────────────────────────────

export interface StorageOptionCardProps {
  title: string;
  desc: string;
  badge: string;
  icon: IconRenderer;
  selected: boolean;
  onSelect: () => void;
}

export function StorageOptionCard({ title, desc, badge, icon, selected, onSelect }: StorageOptionCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-4 rounded-[14px] border p-4 text-left transition-all',
        selected
          ? 'border-[var(--vestara-color-os-inverse)] bg-[var(--vestara-color-os-inverse)] text-[var(--vestara-color-os-auth-canvas)]'
          : 'border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/40 text-[var(--vestara-color-os-inverse)] hover:border-[var(--vestara-color-os-inverse)]/20',
      )}
    >
      <div
        className={cn(
          'grid h-10 w-10 place-items-center rounded-[10px]',
          selected
            ? 'bg-[var(--vestara-color-os-auth-canvas)] text-[var(--vestara-color-os-inverse)]'
            : 'bg-[var(--vestara-color-os-inverse)]/10',
        )}
      >
        {createElement(icon, { className: 'h-5 w-5' })}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium">{title}</span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[9px]',
              selected
                ? 'bg-[var(--vestara-color-os-auth-canvas)] text-[var(--vestara-color-os-inverse)]'
                : 'bg-[var(--vestara-color-os-inverse)]/10 text-[var(--vestara-text-os-secondary)]',
            )}
          >
            {badge}
          </span>
        </div>
        <div
          className={cn(
            'mt-0.5 font-mono text-[11px]',
            selected ? 'text-[var(--vestara-color-os-auth-canvas)]/60' : 'text-[var(--vestara-text-os-secondary)]',
          )}
        >
          {desc}
        </div>
      </div>
      <div
        className={cn(
          'grid h-5 w-5 place-items-center rounded-full border-2',
          selected ? 'border-[var(--vestara-color-os-auth-canvas)]' : 'border-[var(--vestara-color-os-inverse)]/20',
        )}
      >
        {selected && <div className="h-2.5 w-2.5 rounded-full bg-[var(--vestara-color-os-auth-canvas)]" />}
      </div>
    </button>
  );
}

// ─── PartitionCard / ABPartitionLayout ─────────────────────────

export interface PartitionCardProps {
  dev: string;
  name: string;
  pct: number;
  active?: boolean;
}

export function PartitionCard({ dev, name, pct, active = false }: PartitionCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[12px] border-2 p-3',
        active
          ? 'border-[var(--vestara-status-os-success)]/50 bg-[var(--vestara-status-os-success)]/10'
          : 'border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-inverse)]/[0.03]',
      )}
    >
      {active && (
        <div className="absolute right-0 top-0 rounded-bl-[8px] bg-[var(--vestara-status-os-success)] px-2 py-0.5 font-mono text-[9px] font-bold text-[var(--vestara-color-os-auth-canvas)]">
          ACTIVE • VERIFIED
        </div>
      )}
      <div className="font-mono text-[11px] font-bold text-[var(--vestara-color-os-inverse)]">{dev}</div>
      <div className="mt-1 font-mono text-[10px] text-[var(--vestara-text-os-secondary)]">{name}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--vestara-color-os-auth-canvas)]/50">
        <div
          className={cn(
            'h-full',
            active ? 'bg-[var(--vestara-status-os-success)]' : 'bg-[var(--vestara-color-os-inverse)]/20',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 font-mono text-[9px] text-[var(--vestara-text-os-faint)]">
        {pct}% {active ? 'sealed rootfs' : 'Ready for atomic update'}
      </div>
    </div>
  );
}

export interface ABPartitionLayoutProps {
  activePct?: number;
  standbyPct?: number;
}

export function ABPartitionLayout({ activePct = 78, standbyPct = 12 }: ABPartitionLayoutProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">
        <span>A/B PARTITION LAYOUT</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[var(--vestara-status-os-success)]" /> vestara_a ACTIVE
          </span>
          <span className="flex items-center gap-1 opacity-60">
            <span className="h-2 w-2 rounded-full bg-[var(--vestara-color-os-inverse)]/30" /> vestara_b STANDBY
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PartitionCard dev="/dev/nvme0n1p2" name="vestara_a • 64GB • ext4 immutable" pct={activePct} active />
        <PartitionCard dev="/dev/nvme0n1p3" name="vestara_b • 64GB • standby" pct={standbyPct} />
      </div>
    </div>
  );
}

// ─── SecureBootToggle ──────────────────────────────────────────

export interface SecureBootToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function SecureBootToggle({ enabled, onToggle }: SecureBootToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className="flex cursor-pointer items-center gap-3"
      >
        <span
          className={cn(
            'flex h-6 w-[42px] rounded-full p-0.5 transition-all',
            enabled
              ? 'justify-end bg-[var(--vestara-accent-os-cyan)]'
              : 'justify-start bg-[var(--vestara-color-os-inverse)]/15',
          )}
        >
          <span className="block h-5 w-5 rounded-full bg-[var(--vestara-color-os-inverse)] shadow" />
        </span>
        <span className="font-mono text-[11px] text-[var(--vestara-color-os-inverse)]">Secure Boot Enforce</span>
      </button>
      <span className="rounded border border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-inverse)]/5 px-2 py-1 font-mono text-[10px] text-[var(--vestara-text-os-secondary)]">
        STORAGE: AES-256-XTS • TPM2 SEALED
      </span>
    </div>
  );
}

// ─── ProviderCard ──────────────────────────────────────────────

export interface ProviderCardProps {
  title: string;
  desc: string;
  meta: string;
  icon: IconRenderer;
  selected: boolean;
  onSelect: () => void;
  isDefault?: boolean;
}

export function ProviderCard({ title, desc, meta, icon, selected, onSelect, isDefault }: ProviderCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full gap-4 rounded-[14px] border p-4 text-left transition-all',
        selected
          ? 'border-[var(--vestara-color-os-inverse)] bg-[var(--vestara-color-os-inverse)] text-[var(--vestara-color-os-auth-canvas)]'
          : 'border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/40 text-[var(--vestara-color-os-inverse)] hover:border-[var(--vestara-color-os-inverse)]/20',
      )}
    >
      <div
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-[10px]',
          selected
            ? 'bg-[var(--vestara-color-os-auth-canvas)] text-[var(--vestara-color-os-inverse)]'
            : 'bg-[var(--vestara-color-os-inverse)]/10',
        )}
      >
        {createElement(icon, { className: 'h-5 w-5' })}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium">{title}</span>
          {isDefault && (
            <span className="rounded bg-[var(--vestara-accent-os-cyan)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--vestara-color-os-auth-canvas)]">
              DEFAULT
            </span>
          )}
        </div>
        <div
          className={cn(
            'mt-1 font-mono text-[11px]',
            selected ? 'text-[var(--vestara-color-os-auth-canvas)]/60' : 'text-[var(--vestara-text-os-secondary)]',
          )}
        >
          {desc}
        </div>
        <div
          className={cn(
            'mt-2 inline-block rounded-full px-2 py-1 font-mono text-[9px]',
            selected ? 'bg-[var(--vestara-color-os-auth-canvas)]/10' : 'bg-[var(--vestara-color-os-inverse)]/10',
          )}
        >
          {meta}
        </div>
      </div>
    </button>
  );
}

// ─── ConnectionTestButton ──────────────────────────────────────

export interface ConnectionTestButtonProps {
  status: ConnectionStatus;
  onTest: () => void;
}

export function ConnectionTestButton({ status, onTest }: ConnectionTestButtonProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onTest}
        disabled={status === 'testing'}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-accent-os-cyan)]/10 px-4 font-mono text-[11px] text-[var(--vestara-accent-os-cyan)] transition-colors hover:bg-[var(--vestara-accent-os-cyan)]/20 disabled:opacity-50"
      >
        <Terminal className="h-3.5 w-3.5" />
        {status === 'idle' && 'Test Connection'}
        {status === 'testing' && 'Testing…'}
        {status === 'ok' && '✓ Connected • 23ms'}
        {status === 'fail' && '↻ Retry • No daemon'}
      </button>
      <div className="font-mono text-[10px] text-[var(--vestara-text-os-faint)]">
        Ollama on-demand only — no auto-start daemon
      </div>
    </div>
  );
}

// ─── ExtensionCard ─────────────────────────────────────────────

export interface ExtensionCardProps {
  title: string;
  desc: string;
  icon: IconRenderer;
  size: string;
  vers: string;
  selected: boolean;
  onToggle: () => void;
}

export function ExtensionCard({ title, desc, icon, size, vers, selected, onToggle }: ExtensionCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'flex w-full gap-4 rounded-[14px] border p-4 text-left transition-all',
        selected
          ? 'border-[var(--vestara-color-os-inverse)] bg-[var(--vestara-color-os-inverse)] text-[var(--vestara-color-os-auth-canvas)]'
          : 'border-[var(--vestara-color-os-inverse)]/10 bg-[var(--vestara-color-os-auth-canvas)]/40 text-[var(--vestara-color-os-inverse)] hover:border-[var(--vestara-color-os-inverse)]/20',
      )}
    >
      <div
        className={cn(
          'grid h-10 w-10 place-items-center rounded-[10px]',
          selected
            ? 'bg-[var(--vestara-color-os-auth-canvas)] text-[var(--vestara-color-os-inverse)]'
            : 'bg-[var(--vestara-color-os-inverse)]/10',
        )}
      >
        {createElement(icon, { className: 'h-5 w-5' })}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          {title}
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[9px]',
              selected ? 'bg-[var(--vestara-color-os-auth-canvas)]/10' : 'bg-[var(--vestara-color-os-inverse)]/10',
            )}
          >
            {vers}
          </span>
        </div>
        <div
          className={cn(
            'mt-1 font-mono text-[11px]',
            selected ? 'text-[var(--vestara-color-os-auth-canvas)]/60' : 'text-[var(--vestara-text-os-secondary)]',
          )}
        >
          {desc}
        </div>
        <div
          className={cn(
            'mt-2 font-mono text-[9px]',
            selected ? 'text-[var(--vestara-color-os-auth-canvas)]/50' : 'text-[var(--vestara-text-os-faint)]',
          )}
        >
          {size} • TS STRICT • SANDBOXED
        </div>
      </div>
      <div
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2',
          selected
            ? 'border-[var(--vestara-color-os-auth-canvas)] bg-[var(--vestara-color-os-auth-canvas)] text-[var(--vestara-color-os-inverse)]'
            : 'border-[var(--vestara-color-os-inverse)]/20',
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </div>
    </button>
  );
}

// ─── RuntimeNotice ─────────────────────────────────────────────

export interface RuntimeNoticeProps {
  children?: ReactNode;
}

export function RuntimeNotice({ children }: RuntimeNoticeProps) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-accent-os-cyan)]/10 p-3 font-mono text-[11px] text-[var(--vestara-accent-os-cyan)]">
      <Puzzle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {children ?? (
          <>
            Extension runtime enforces a single authority:{' '}
            <code className="rounded border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-color-os-auth-canvas)]/30 px-1.5 py-0.5">
              @vestara/extension-runtime
            </code>{' '}
            — prevents lifecycle conflicts across sandboxes.
          </>
        )}
      </span>
    </div>
  );
}

// ─── StepProgress ──────────────────────────────────────────────

export interface StepProgressProps {
  step: number;
  total: number;
}

export function StepProgress({ step, total }: StepProgressProps) {
  const pct = (step / total) * 100;
  const dots = Array.from({ length: total }, (_, position) => ({
    key: `dot-${position}`,
    filled: position + 1 <= step,
  }));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-[var(--vestara-text-os-faint)]">
        <span>ONBOARDING FLOW</span>
        <span>
          STEP {step} / {total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--vestara-color-os-inverse)]/10">
        <div
          className="h-full bg-[var(--vestara-accent-os-cyan)] transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1.5">
        {dots.map((dot) => (
          <div
            key={dot.key}
            className={cn(
              'h-1 flex-1 rounded-full transition-all',
              dot.filled ? 'bg-[var(--vestara-color-os-inverse)]' : 'bg-[var(--vestara-color-os-inverse)]/15',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── OnboardingShell ───────────────────────────────────────────

export interface OnboardingShellProps {
  step: number;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function OnboardingShell({ step, title, children, footer }: OnboardingShellProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--vestara-accent-os-cyan)]/20 bg-[var(--vestara-surface-os-raised)]/70 backdrop-blur-[24px] shadow-[var(--vestara-elevation-xl)]">
      <div className="p-8 md:p-10">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--vestara-color-os-inverse)] font-bold text-[var(--vestara-color-os-auth-canvas)]">
            {step}
          </div>
          <h2 className="text-[22px] font-bold tracking-tight text-[var(--vestara-color-os-inverse)]">{title}</h2>
          <Sparkles className="ml-auto h-4 w-4 text-[var(--vestara-accent-os-cyan)]" />
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {footer && (
        <div className="flex items-center justify-between rounded-b-[28px] border-t border-[var(--vestara-color-os-inverse)]/[0.06] bg-[var(--vestara-color-os-auth-canvas)]/20 px-8 py-3 font-mono text-[10px] text-[var(--vestara-text-os-faint)] md:px-10">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Convenience icon re-exports (used by onboarding galleries) ─

export const StorageIcons = { HardDrive, Server, Sparkles } as const;
