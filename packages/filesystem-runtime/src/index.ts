import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FsChangeSummary,
  FsConfig,
  FsMetadata,
  FsObservation,
  FsOperation,
  FsOperationRecord,
  FsOperationStatus,
  FsOperationType,
  FsPatch,
  FsResult,
  FsRiskLevel,
} from './types.js';

export type {
  FsChangeSummary,
  FsConfig,
  FsMetadata,
  FsObservation,
  FsOperation,
  FsOperationRecord,
  FsOperationStatus,
  FsOperationType,
  FsPatch,
  FsResult,
  FsRiskLevel,
} from './types.js';

let opCounter = 0;

const RISK_MAP: Record<FsOperationType, FsRiskLevel> = {
  read: 'low',
  list: 'low',
  exists: 'low',
  stat: 'low',
  search: 'low',
  references: 'low',
  write: 'medium',
  create: 'medium',
  update: 'medium',
  rename: 'medium',
  copy: 'medium',
  delete: 'high',
};

const DEFAULT_DENY_LIST = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'credentials.json',
  'service-account.json',
  '.git-credentials',
  '.netrc',
];

function classifyRisk(files?: string[]): FsRiskLevel {
  if (!files || files.length === 0) return 'low';
  if (files.length > 10) return 'high';
  for (const f of files) {
    const base = path.basename(f);
    if (base === 'package.json' || base === 'tsconfig.json' || base === '.git' || base === 'node_modules') {
      return 'high';
    }
  }
  return 'medium';
}

function riskLevel(type: FsOperationType, filePath?: string): FsRiskLevel {
  const fromType = RISK_MAP[type];
  const fromFiles = filePath ? classifyRisk([filePath]) : 'low';
  const order: FsRiskLevel[] = ['low', 'medium', 'high'];
  return order[Math.max(order.indexOf(fromType), order.indexOf(fromFiles))];
}

function makeOp(
  type: FsOperationType,
  filePath: string,
  opts?: { agentId?: string; reason?: string; targetPath?: string; content?: string },
): FsOperation {
  return {
    id: `fs-${Date.now()}-${++opCounter}`,
    type,
    path: filePath,
    targetPath: opts?.targetPath,
    size: opts?.content ? Buffer.byteLength(opts.content, 'utf-8') : undefined,
    agentId: opts?.agentId,
    reason: opts?.reason,
    createdAt: new Date().toISOString(),
    riskLevel: riskLevel(type, filePath),
  };
}

/** Line-based multiset diff used for change summaries. */
function diffLineSummary(before: string, after: string): FsChangeSummary {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const beforeCount = new Map<string, number>();
  for (const line of beforeLines) beforeCount.set(line, (beforeCount.get(line) ?? 0) + 1);
  const afterCount = new Map<string, number>();
  for (const line of afterLines) afterCount.set(line, (afterCount.get(line) ?? 0) + 1);

  let added = 0;
  let removed = 0;
  for (const [line, count] of afterCount) {
    const prior = beforeCount.get(line) ?? 0;
    if (count > prior) added += count - prior;
  }
  for (const [line, count] of beforeCount) {
    const now = afterCount.get(line) ?? 0;
    if (count > now) removed += count - now;
  }

  return {
    added,
    removed,
    changed: added + removed > 0,
    beforeSize: Buffer.byteLength(before, 'utf-8'),
    afterSize: Buffer.byteLength(after, 'utf-8'),
  };
}

/** Apply a patch to file content. */
function applyPatch(content: string, patch: FsPatch): string {
  let result = content;

  if (patch.replace) {
    for (const { search, replace } of patch.replace) {
      if (search === '') continue;
      result = result.split(search).join(replace);
    }
  }

  if (patch.removeLines || patch.insert) {
    const lines = result.split('\n');

    if (patch.removeLines) {
      const ranges = patch.removeLines
        .map((r) => ({ start: Math.max(1, r.startLine), end: r.endLine ?? r.startLine }))
        .sort((a, b) => b.start - a.start);
      for (const { start, end } of ranges) {
        const safeEnd = Math.min(lines.length, end);
        if (start <= safeEnd) lines.splice(start - 1, safeEnd - start + 1);
      }
    }

    if (patch.insert) {
      const inserts = [...patch.insert].sort((a, b) => a.atLine - b.atLine);
      for (const { atLine, content: inserted } of inserts) {
        const idx = Math.max(0, Math.min(lines.length, atLine - 1));
        lines.splice(idx, 0, inserted);
      }
    }

    result = lines.join('\n');
  }

  return result;
}

export class FilesystemRuntime {
  private rootDir: string;
  private pendingApprovals: Map<string, FsOperation> = new Map();
  private telemetry?: FsConfig['telemetry'];
  private policyEngine?: FsConfig['policyEngine'];
  private onPendingApproval?: FsConfig['onPendingApproval'];
  private onOperation?: FsConfig['onOperation'];
  private dryRun: boolean;
  private historyLimit: number;
  private denyList: string[];
  private history: FsOperationRecord[] = [];

  constructor(config: FsConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.telemetry = config.telemetry;
    this.policyEngine = config.policyEngine;
    this.onPendingApproval = config.onPendingApproval;
    this.onOperation = config.onOperation;
    this.dryRun = config.dryRun ?? false;
    this.historyLimit = config.historyLimit ?? 200;
    this.denyList = config.denyList ?? DEFAULT_DENY_LIST;
  }

  /**
   * Resolve a path relative to the workspace root and enforce the
   * sandbox boundary. Absolute paths and `..` escapes are rejected.
   */
  private resolve(p: string): string {
    const resolved = path.resolve(this.rootDir, p);
    const relative = path.relative(this.rootDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path escapes workspace root: ${p}`);
    }
    if (this.denyList.includes(path.basename(resolved))) {
      throw new Error(`Access denied to denied file: ${path.basename(resolved)}`);
    }
    return resolved;
  }

  private async evaluate(
    op: FsOperation,
    approvalId?: string,
  ): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
    // If an approval ID is provided and it's been approved, let it through
    if (approvalId) {
      const pending = this.pendingApprovals.get(approvalId);
      if (pending?.approvalStatus === 'approved') {
        this.pendingApprovals.delete(approvalId);
        return { allowed: true, requiresApproval: false };
      }
      if (pending?.approvalStatus === 'rejected') {
        return { allowed: false, requiresApproval: false, reason: 'Operation was rejected' };
      }
    }

    if (this.policyEngine) {
      try {
        const decision = await this.policyEngine.evaluate({
          action: op.type,
          resource: op.path,
          metadata: { agentId: op.agentId, riskLevel: op.riskLevel },
        });
        if (decision.effect === 'deny') {
          return { allowed: false, requiresApproval: false, reason: decision.reason || 'Denied by policy' };
        }
      } catch {}
    }

    if (op.riskLevel === 'high') {
      this.pendingApprovals.set(op.id, op);
      op.approvalStatus = 'pending';
      this.onPendingApproval?.(op);
      this.record(op, 'pending', { dryRun: false });
      return { allowed: true, requiresApproval: true, reason: 'High-risk operation requires approval' };
    }

    return { allowed: true, requiresApproval: false };
  }

  private emit(
    agentId: string | undefined,
    status: string,
    operation: string,
    detail: string,
    extras?: Record<string, unknown>,
  ): void {
    this.telemetry?.trackOp(agentId || 'filesystem', status, operation as any, detail, extras);
  }

  private observation(
    op: FsOperation,
    status: FsObservation['status'],
    extras?: {
      changes?: FsChangeSummary;
      error?: string;
      reason?: string;
      dryRun?: boolean;
      requiresApproval?: boolean;
    },
  ): FsObservation {
    return {
      operation: op.type,
      file: op.path,
      status,
      changes: extras?.changes,
      dryRun: extras?.dryRun,
      agentId: op.agentId,
      reason: extras?.reason,
      error: extras?.error,
      requiresApproval: extras?.requiresApproval,
      timestamp: new Date().toISOString(),
    };
  }

  private record(
    op: FsOperation,
    status: FsOperationStatus,
    extras?: { summary?: FsChangeSummary; error?: string; dryRun?: boolean },
  ): FsOperationRecord {
    const entry: FsOperationRecord = {
      ...op,
      status,
      dryRun: extras?.dryRun ?? false,
      completedAt: new Date().toISOString(),
      summary: extras?.summary,
      error: extras?.error,
    };
    this.history.push(entry);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.onOperation?.(entry);
    return entry;
  }

  private success<T>(op: FsOperation, data: T, extras?: { changes?: FsChangeSummary; dryRun?: boolean }): FsResult<T> {
    this.record(op, 'completed', { summary: extras?.changes, dryRun: extras?.dryRun });
    return {
      ok: true,
      data,
      operation: op,
      requiresApproval: false,
      dryRun: extras?.dryRun,
      observation: this.observation(op, 'success', extras),
    };
  }

  private fail(op: FsOperation, error: string, extras?: { dryRun?: boolean }): FsResult<never> {
    this.record(op, 'failed', { error, dryRun: extras?.dryRun });
    return {
      ok: false,
      error,
      operation: op,
      requiresApproval: false,
      dryRun: extras?.dryRun,
      observation: this.observation(op, 'failed', { error, dryRun: extras?.dryRun }),
    };
  }

  private pending(op: FsOperation, reason: string): FsResult<never> {
    return {
      ok: false,
      error: reason,
      operation: op,
      requiresApproval: true,
      approvalId: op.id,
      observation: this.observation(op, 'pending', { reason, requiresApproval: true }),
    };
  }

  async read(filePath: string, agentId?: string): Promise<FsResult<string>> {
    const op = makeOp('read', filePath, { agentId });
    const evalResult = await this.evaluate(op);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    try {
      const absPath = this.resolve(filePath);
      const data = fs.readFileSync(absPath, 'utf-8');
      this.emit(agentId, 'completed', 'file.read', `Read ${filePath}`, { filePath });
      return this.success(op, data);
    } catch (err) {
      return this.fail(op, (err as Error).message);
    }
  }

  async write(
    filePath: string,
    content: string,
    opts?: { agentId?: string; reason?: string; approvalId?: string; dryRun?: boolean },
  ): Promise<FsResult<{ path: string; size: number }>> {
    const op = makeOp('write', filePath, { ...opts, content });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    const dryRun = opts?.dryRun ?? this.dryRun;
    try {
      const absPath = this.resolve(filePath);
      const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : '';
      const summary = diffLineSummary(existing, content);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf-8');
      }
      this.emit(opts?.agentId, 'completed', 'file.write', `Wrote ${filePath}`, {
        filePath,
        size: op.size,
        added: summary.added,
        removed: summary.removed,
        dryRun,
      });
      return this.success(op, { path: filePath, size: op.size ?? 0 }, { changes: summary, dryRun });
    } catch (err) {
      return this.fail(op, (err as Error).message, { dryRun });
    }
  }

  /**
   * Update an existing (or new) file via a patch. Returns a change summary.
   */
  async update(
    filePath: string,
    patch: FsPatch,
    opts?: { agentId?: string; reason?: string; approvalId?: string; dryRun?: boolean },
  ): Promise<FsResult<{ path: string; summary: FsChangeSummary }>> {
    const op = makeOp('update', filePath, { ...opts });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    const dryRun = opts?.dryRun ?? this.dryRun;
    try {
      const absPath = this.resolve(filePath);
      const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : '';
      const after = applyPatch(before, patch);
      const summary = diffLineSummary(before, after);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, after, 'utf-8');
      }
      this.emit(opts?.agentId, 'completed', 'file.update', `Updated ${filePath}`, {
        filePath,
        added: summary.added,
        removed: summary.removed,
        dryRun,
      });
      return this.success(op, { path: filePath, summary }, { changes: summary, dryRun });
    } catch (err) {
      return this.fail(op, (err as Error).message, { dryRun });
    }
  }

  async delete(
    filePath: string,
    opts?: { agentId?: string; reason?: string; approvalId?: string; dryRun?: boolean },
  ): Promise<FsResult<void>> {
    const op = makeOp('delete', filePath, opts);
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    const dryRun = opts?.dryRun ?? this.dryRun;
    try {
      if (!dryRun) {
        const absPath = this.resolve(filePath);
        const stat = fs.statSync(absPath);
        if (stat.isDirectory()) fs.rmSync(absPath, { recursive: true });
        else fs.unlinkSync(absPath);
      } else {
        // Validate path even in dry-run mode
        this.resolve(filePath);
      }
      this.emit(opts?.agentId, 'completed', 'file.delete', `Deleted ${filePath}`, { filePath, dryRun });
      return this.success(op, undefined, { dryRun });
    } catch (err) {
      return this.fail(op, (err as Error).message, { dryRun });
    }
  }

  async create(
    filePath: string,
    content?: string,
    opts?: { agentId?: string; reason?: string; approvalId?: string; dryRun?: boolean },
  ): Promise<FsResult<{ path: string }>> {
    const op = makeOp('create', filePath, { ...opts, content });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    const dryRun = opts?.dryRun ?? this.dryRun;
    try {
      const absPath = this.resolve(filePath);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        if (content !== undefined) fs.writeFileSync(absPath, content, 'utf-8');
        else if (filePath.endsWith('/') || !path.extname(filePath)) fs.mkdirSync(absPath, { recursive: true });
        else fs.writeFileSync(absPath, '', 'utf-8');
      }
      this.emit(opts?.agentId, 'completed', 'file.write', `Created ${filePath}`, { filePath, dryRun });
      return this.success(op, { path: filePath }, { dryRun });
    } catch (err) {
      return this.fail(op, (err as Error).message, { dryRun });
    }
  }

  async rename(
    oldPath: string,
    newPath: string,
    opts?: { agentId?: string; reason?: string; approvalId?: string; dryRun?: boolean },
  ): Promise<FsResult<void>> {
    const op = makeOp('rename', oldPath, { ...opts, targetPath: newPath });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    const dryRun = opts?.dryRun ?? this.dryRun;
    try {
      if (!dryRun) {
        const dest = this.resolve(newPath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(this.resolve(oldPath), dest);
      } else {
        this.resolve(oldPath);
        this.resolve(newPath);
      }
      this.emit(opts?.agentId, 'completed', 'file.write', `Renamed ${oldPath} → ${newPath}`, {
        filePath: oldPath,
        dryRun,
      });
      return this.success(op, undefined, { dryRun });
    } catch (err) {
      return this.fail(op, (err as Error).message, { dryRun });
    }
  }

  async copy(
    source: string,
    destination: string,
    opts?: { agentId?: string; reason?: string; approvalId?: string; dryRun?: boolean },
  ): Promise<FsResult<{ source: string; destination: string; size: number }>> {
    const op = makeOp('copy', source, { ...opts, targetPath: destination });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    const dryRun = opts?.dryRun ?? this.dryRun;
    try {
      const src = this.resolve(source);
      const dest = this.resolve(destination);
      let size = 0;
      if (!dryRun) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        size = fs.statSync(dest).size;
      } else {
        size = fs.statSync(src).size;
      }
      this.emit(opts?.agentId, 'completed', 'file.copy', `Copied ${source} → ${destination}`, {
        source,
        destination,
        dryRun,
      });
      return this.success(op, { source, destination, size }, { dryRun });
    } catch (err) {
      return this.fail(op, (err as Error).message, { dryRun });
    }
  }

  async stat(filePath: string, agentId?: string): Promise<FsResult<FsMetadata>> {
    const op = makeOp('stat', filePath, { agentId });
    const evalResult = await this.evaluate(op);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    try {
      const absPath = this.resolve(filePath);
      const s = fs.statSync(absPath);
      return this.success(op, {
        path: filePath,
        size: s.size,
        isDirectory: s.isDirectory(),
        isFile: s.isFile(),
        isSymlink: s.isSymbolicLink(),
        modifiedAt: s.mtime.toISOString(),
        createdAt: s.birthtime.toISOString(),
      });
    } catch (err) {
      return this.fail(op, (err as Error).message);
    }
  }

  async list(dirPath?: string, agentId?: string): Promise<FsResult<string[]>> {
    const op = makeOp('list', dirPath || '.', { agentId });
    const evalResult = await this.evaluate(op);
    if (!evalResult.allowed) return this.fail(op, evalResult.reason || 'Denied');
    if (evalResult.requiresApproval) return this.pending(op, evalResult.reason || 'Requires approval');
    try {
      const entries = fs.readdirSync(this.resolve(dirPath || '.'));
      return this.success(op, entries);
    } catch (err) {
      return this.fail(op, (err as Error).message);
    }
  }

  async exists(filePath: string, agentId?: string): Promise<FsResult<boolean>> {
    const op = makeOp('exists', filePath, { agentId });
    try {
      const found = fs.existsSync(this.resolve(filePath));
      return this.success(op, found);
    } catch (err) {
      return this.fail(op, (err as Error).message);
    }
  }

  approve(approvalId: string): boolean {
    const op = this.pendingApprovals.get(approvalId);
    if (op?.approvalStatus !== 'pending') return false;
    op.approvalStatus = 'approved';
    this.emit(op.agentId, 'completed', 'decide', `Approved: ${op.type} ${op.path}`);
    return true;
  }

  reject(approvalId: string): boolean {
    const op = this.pendingApprovals.get(approvalId);
    if (!op) return false;
    op.approvalStatus = 'rejected';
    this.emit(op.agentId, 'failed', 'decide', `Rejected: ${op.type} ${op.path}`);
    return true;
  }

  getPendingApprovals(): FsOperation[] {
    return Array.from(this.pendingApprovals.values()).filter((o) => o.approvalStatus === 'pending');
  }

  /**
   * Return a copy of the operation history (most recent last).
   */
  getHistory(): FsOperationRecord[] {
    return [...this.history];
  }

  get root(): string {
    return this.rootDir;
  }

  /**
   * Search file contents for a pattern (grep-like).
   * If pattern starts with "glob:", treats the rest as a filename glob pattern.
   */
  async search(pattern: string, searchDir?: string, agentId?: string): Promise<FsResult<string[]>> {
    const op = makeOp('search', searchDir || '.', { agentId });
    try {
      const absDir = this.resolve(searchDir || '.');
      if (pattern.startsWith('glob:')) {
        const globPattern = pattern.slice(5);
        const allFiles = this.walkSync(absDir);
        const regex = new RegExp(globPattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
        const matches = allFiles.filter((f) => regex.test(f)).slice(0, 50);
        return this.success(op, matches);
      }

      // Content search
      const results: string[] = [];
      const allFiles = this.walkSync(absDir).filter((f) => /\.(ts|tsx|js|jsx|json|md|css|html|yaml|yml|sh)$/i.test(f));
      const lowerPattern = pattern.toLowerCase();
      for (const file of allFiles) {
        try {
          const content = fs.readFileSync(path.join(absDir, file), 'utf-8');
          if (content.toLowerCase().includes(lowerPattern)) {
            results.push(file);
            if (results.length >= 30) break;
          }
        } catch {}
      }
      this.emit(agentId, 'completed', 'search', `Searched for "${pattern}"`, { pattern, matches: results.length });
      return this.success(op, results);
    } catch (err) {
      return this.fail(op, (err as Error).message);
    }
  }

  /**
   * Find import/usages of a given file path.
   * Searches all source files for import/require statements referencing the path.
   */
  async references(filePath: string, agentId?: string): Promise<FsResult<string[]>> {
    const op = makeOp('references', filePath, { agentId });
    try {
      const absDir = this.resolve('.');
      const allFiles = this.walkSync(absDir).filter((f) => /\.(ts|tsx|js|jsx)$/i.test(f));
      const baseName = path.basename(filePath.replace(/\.(ts|tsx|js|jsx)$/, ''));
      const refs: string[] = [];

      for (const file of allFiles) {
        try {
          const content = fs.readFileSync(path.join(absDir, file), 'utf-8');
          const importPattern = new RegExp(
            `(?:import|require)\\s*[\\({][^)]*${baseName}[^)]*[\\)]|[from]\\s*['"]\\.?/?${baseName}`,
            'i',
          );
          if (importPattern.test(content)) {
            refs.push(file);
          }
        } catch {}
      }
      this.emit(agentId, 'completed', 'search', `References for ${filePath}`, { matches: refs.length });
      return this.success(op, refs);
    } catch (err) {
      return this.fail(op, (err as Error).message);
    }
  }

  /**
   * Walk a directory recursively and return relative file paths.
   */
  private walkSync(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkSync(fullPath));
      } else {
        results.push(path.relative(this.rootDir, fullPath));
      }
    }
    return results;
  }
}
