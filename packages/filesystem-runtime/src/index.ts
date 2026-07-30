import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FsConfig, FsOperation, FsOperationType, FsResult, FsRiskLevel } from './types.js';

let opCounter = 0;

const RISK_MAP: Record<FsOperationType, FsRiskLevel> = {
  read: 'low',
  list: 'low',
  exists: 'low',
  write: 'medium',
  create: 'medium',
  rename: 'medium',
  copy: 'medium',
  delete: 'high',
};

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

function makeOp(type: FsOperationType, filePath: string, opts?: { agentId?: string; reason?: string; targetPath?: string; content?: string }): FsOperation {
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

export class FilesystemRuntime {
  private rootDir: string;
  private pendingApprovals: Map<string, FsOperation> = new Map();
  private telemetry?: FsConfig['telemetry'];
  private policyEngine?: FsConfig['policyEngine'];
  private onPendingApproval?: FsConfig['onPendingApproval'];

  constructor(config: FsConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.telemetry = config.telemetry;
    this.policyEngine = config.policyEngine;
    this.onPendingApproval = config.onPendingApproval;
  }

  private resolve(p: string): string {
    return path.resolve(this.rootDir, p);
  }

  private async evaluate(op: FsOperation, approvalId?: string): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
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
      return { allowed: true, requiresApproval: true, reason: 'High-risk operation requires approval' };
    }

    return { allowed: true, requiresApproval: false };
  }

  private emit(agentId: string | undefined, status: string, operation: string, detail: string, extras?: Record<string, unknown>): void {
    this.telemetry?.trackOp(agentId || 'filesystem', status, operation as any, detail, extras);
  }

  async read(filePath: string, agentId?: string): Promise<FsResult<string>> {
    const op = makeOp('read', filePath, { agentId });
    const evalResult = await this.evaluate(op);
    if (!evalResult.allowed) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: false };
    if (evalResult.requiresApproval) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: true, approvalId: op.id };
    try {
      const absPath = this.resolve(filePath);
      const data = fs.readFileSync(absPath, 'utf-8');
      this.emit(agentId, 'completed', 'file.read', `Read ${filePath}`, { filePath });
      return { ok: true, data, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  async write(filePath: string, content: string, opts?: { agentId?: string; reason?: string; approvalId?: string }): Promise<FsResult<void>> {
    const op = makeOp('write', filePath, { ...opts, content });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: false };
    if (evalResult.requiresApproval) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: true, approvalId: op.id };
    try {
      const absPath = this.resolve(filePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content, 'utf-8');
      this.emit(opts?.agentId, 'completed', 'file.write', `Wrote ${filePath}`, { filePath, size: op.size });
      return { ok: true, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  async delete(filePath: string, opts?: { agentId?: string; reason?: string; approvalId?: string }): Promise<FsResult<void>> {
    const op = makeOp('delete', filePath, opts);
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: false };
    if (evalResult.requiresApproval) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: true, approvalId: op.id };
    try {
      const absPath = this.resolve(filePath);
      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) fs.rmSync(absPath, { recursive: true });
      else fs.unlinkSync(absPath);
      this.emit(opts?.agentId, 'completed', 'file.delete', `Deleted ${filePath}`, { filePath });
      return { ok: true, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  async create(filePath: string, content?: string, opts?: { agentId?: string; reason?: string; approvalId?: string }): Promise<FsResult<void>> {
    const op = makeOp('create', filePath, { ...opts, content });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: false };
    if (evalResult.requiresApproval) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: true, approvalId: op.id };
    try {
      const absPath = this.resolve(filePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      if (content !== undefined) fs.writeFileSync(absPath, content, 'utf-8');
      else if (filePath.endsWith('/') || !path.extname(filePath)) fs.mkdirSync(absPath, { recursive: true });
      else fs.writeFileSync(absPath, '', 'utf-8');
      this.emit(opts?.agentId, 'completed', 'file.write', `Created ${filePath}`, { filePath });
      return { ok: true, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  async rename(oldPath: string, newPath: string, opts?: { agentId?: string; reason?: string; approvalId?: string }): Promise<FsResult<void>> {
    const op = makeOp('rename', oldPath, { ...opts, targetPath: newPath });
    const evalResult = await this.evaluate(op, opts?.approvalId);
    if (!evalResult.allowed) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: false };
    if (evalResult.requiresApproval) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: true, approvalId: op.id };
    try {
      fs.renameSync(this.resolve(oldPath), this.resolve(newPath));
      this.emit(opts?.agentId, 'completed', 'file.write', `Renamed ${oldPath} → ${newPath}`, { filePath: oldPath });
      return { ok: true, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  async list(dirPath?: string, agentId?: string): Promise<FsResult<string[]>> {
    const op = makeOp('list', dirPath || '.', { agentId });
    const evalResult = await this.evaluate(op);
    if (!evalResult.allowed) return { ok: false, error: evalResult.reason, operation: op, requiresApproval: false };
    try {
      const entries = fs.readdirSync(this.resolve(dirPath || '.'));
      return { ok: true, data: entries, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  async exists(filePath: string, agentId?: string): Promise<FsResult<boolean>> {
    const op = makeOp('exists', filePath, { agentId });
    try {
      const found = fs.existsSync(this.resolve(filePath));
      return { ok: true, data: found, operation: op, requiresApproval: false };
    } catch (err) {
      return { ok: false, error: (err as Error).message, operation: op, requiresApproval: false };
    }
  }

  approve(approvalId: string): boolean {
    const op = this.pendingApprovals.get(approvalId);
    if (!op || op.approvalStatus !== 'pending') return false;
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
}
