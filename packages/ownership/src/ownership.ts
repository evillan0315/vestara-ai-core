import type { RuntimeId, Timestamp } from '@vestara/types';

export type ResourceKind = 'file' | 'repository' | 'database' | 'module' | 'widget' | 'session' | 'custom';

export interface ResourceDescriptor {
  readonly kind: ResourceKind;
  readonly id: string;
}

export interface OwnershipEntry {
  readonly resource: ResourceDescriptor;
  readonly owner: RuntimeId;
  readonly grantedAt: Timestamp;
}

export interface LockState {
  readonly resource: ResourceDescriptor;
  readonly holder: RuntimeId;
  readonly acquiredAt: Timestamp;
  readonly expiresAt: Timestamp;
}

export interface ResourceLockOptions {
  timeoutMs?: number;
  defaultTimeoutMs?: number;
  allowReentrant?: boolean;
}

export type LockResult =
  | { readonly status: 'acquired'; readonly lock: LockState }
  | { readonly status: 'held'; readonly lock: LockState }
  | { readonly status: 'timeout'; readonly lock: LockState }
  | { readonly status: 'busy'; readonly reason: string };

const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

/**
 * Resource ownership registry — answers "who owns this resource?" and lets a
 * runtime claim ownership. Ownership grants write access; other runtimes must
 * request write access via the lock manager.
 */
export class OwnershipRegistry {
  private readonly _entries: Map<string, OwnershipEntry> = new Map();

  private key(resource: ResourceDescriptor): string {
    return `${resource.kind}:${resource.id}`;
  }

  claim(resource: ResourceDescriptor, owner: RuntimeId): OwnershipEntry {
    const key = this.key(resource);
    const entry: OwnershipEntry = {
      resource: { ...resource },
      owner,
      grantedAt: new Date().toISOString() as Timestamp,
    };
    this._entries.set(key, entry);
    return entry;
  }

  get(resource: ResourceDescriptor): OwnershipEntry | undefined {
    return this._entries.get(this.key(resource));
  }

  ownerOf(resource: ResourceDescriptor): RuntimeId | undefined {
    return this._entries.get(this.key(resource))?.owner;
  }

  isOwner(resource: ResourceDescriptor, runtime: RuntimeId): boolean {
    return this.ownerOf(resource) === runtime;
  }

  release(resource: ResourceDescriptor): boolean {
    return this._entries.delete(this.key(resource));
  }

  list(): OwnershipEntry[] {
    return Array.from(this._entries.values());
  }
}

/**
 * Resource lock manager — prevents concurrent write conflicts. A lock is
 * keyed by resource and expires after `timeoutMs`, preventing deadlock.
 * Reentrant acquisition is honored when the same runtime already holds it.
 */
export class ResourceLockManager {
  private readonly _locks: Map<string, LockState> = new Map();
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: retained for parity with the injected registry; ownership checks live on OwnershipRegistry.
  private readonly _ownership: OwnershipRegistry;
  private readonly _defaultTimeoutMs: number;
  private readonly _allowReentrant: boolean;

  constructor(ownershipOrOptions?: OwnershipRegistry | ResourceLockOptions, options?: ResourceLockOptions) {
    const ownership = ownershipOrOptions instanceof OwnershipRegistry ? ownershipOrOptions : new OwnershipRegistry();
    const opts = ownershipOrOptions instanceof OwnershipRegistry ? options : ownershipOrOptions;
    this._ownership = ownership;
    this._defaultTimeoutMs = opts?.timeoutMs ?? opts?.defaultTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this._allowReentrant = opts?.allowReentrant ?? true;
  }

  private key(resource: ResourceDescriptor): string {
    return `${resource.kind}:${resource.id}`;
  }

  acquire(resource: ResourceDescriptor, runtime: RuntimeId, options?: ResourceLockOptions): LockResult {
    const timeoutMs = options?.timeoutMs ?? this._defaultTimeoutMs;
    const key = this.key(resource);
    const now = Date.now();

    const existing = this._locks.get(key);
    if (existing) {
      if (existing.expiresAt <= new Date(now).toISOString()) {
        // Expired lock: steal it.
        this._locks.delete(key);
      } else if (existing.holder === runtime && (options?.allowReentrant ?? this._allowReentrant)) {
        return {
          status: 'held',
          lock: existing,
        };
      } else {
        return {
          status: 'busy',
          reason: `Resource ${resource.kind}:${resource.id} is locked by ${existing.holder}`,
        };
      }
    }

    const acquiredAt = new Date(now).toISOString() as Timestamp;
    const expiresAt = new Date(now + timeoutMs).toISOString() as Timestamp;
    const lock: LockState = {
      resource: { ...resource },
      holder: runtime,
      acquiredAt,
      expiresAt,
    };
    this._locks.set(key, lock);
    return { status: 'acquired', lock };
  }

  release(resource: ResourceDescriptor, runtime: RuntimeId): boolean {
    const key = this.key(resource);
    const existing = this._locks.get(key);
    if (!existing) return false;
    if (existing.holder !== runtime) return false;
    this._locks.delete(key);
    return true;
  }

  isHeld(resource: ResourceDescriptor, runtime?: RuntimeId): boolean {
    const existing = this._locks.get(this.key(resource));
    if (!existing) return false;
    if (existing.expiresAt <= new Date().toISOString()) {
      this._locks.delete(this.key(resource));
      return false;
    }
    if (runtime) return existing.holder === runtime;
    return true;
  }

  holderOf(resource: ResourceDescriptor): RuntimeId | undefined {
    const existing = this._locks.get(this.key(resource));
    if (!existing) return undefined;
    if (existing.expiresAt <= new Date().toISOString()) {
      this._locks.delete(this.key(resource));
      return undefined;
    }
    return existing.holder;
  }

  list(): LockState[] {
    const now = new Date().toISOString();
    for (const [key, lock] of this._locks) {
      if (lock.expiresAt <= now) this._locks.delete(key);
    }
    return Array.from(this._locks.values());
  }

  sweepExpired(): number {
    const now = new Date().toISOString();
    let removed = 0;
    for (const [key, lock] of this._locks) {
      if (lock.expiresAt <= now) {
        this._locks.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
