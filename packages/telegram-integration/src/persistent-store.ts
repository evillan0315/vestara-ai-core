/**
 * Telegram Integration — SQLite-backed Persistent Store
 *
 * Durable storage for pairing, workspace bindings, and conversation bindings.
 * Replaces in-memory Maps with SQLite tables that survive process restarts.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-007, TG-008, TG-009)
 */

import type {
  PairingRequest,
  PairingStatus,
  TelegramIdentityBinding,
} from './pairing';
import type { WorkspaceBinding } from './workspace-binding';
import type { ConversationBinding, ConversationBindingStatus } from './conversation-binding';

// ─── Helpers ───────────────────────────────────────────────────

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const r = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return r;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

// ─── Telegram Persistent Store ─────────────────────────────────

export class TelegramPersistentStore {
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
  }

  // ─── Pairing Requests ──────────────────────────────────────

  savePairingRequest(request: PairingRequest): void {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO telegram_pairing_requests
       (id, telegram_user_id, telegram_display_name, token, status, created_at, expires_at, approved_at, principal_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.telegramUserId,
        request.telegramDisplayName,
        request.token,
        request.status,
        request.createdAt,
        request.expiresAt,
        request.approvedAt ?? null,
        request.principalId ?? null,
      ],
    );
  }

  getPairingRequestByToken(token: string): PairingRequest | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_pairing_requests WHERE token = ?',
      [token],
    );
    return row ? this.rowToPairingRequest(row) : undefined;
  }

  getPairingRequestById(id: string): PairingRequest | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_pairing_requests WHERE id = ?',
      [id],
    );
    return row ? this.rowToPairingRequest(row) : undefined;
  }

  countPendingByUser(telegramUserId: string): number {
    const row = dbGet(
      this.db,
      'SELECT COUNT(*) as cnt FROM telegram_pairing_requests WHERE telegram_user_id = ? AND status = ?',
      [telegramUserId, 'pending'],
    );
    return row?.cnt ?? 0;
  }

  deletePairingRequest(id: string): void {
    dbRun(this.db, 'DELETE FROM telegram_pairing_requests WHERE id = ?', [id]);
  }

  // ─── Identity Bindings ─────────────────────────────────────

  saveIdentityBinding(binding: TelegramIdentityBinding): void {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO telegram_identity_bindings
       (id, telegram_user_id, telegram_display_name, principal_id, principal_name, created_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        binding.id,
        binding.telegramUserId,
        binding.telegramDisplayName,
        binding.principalId,
        binding.principalName,
        binding.createdAt,
        binding.active ? 1 : 0,
      ],
    );
  }

  getIdentityBindingByTelegramId(telegramUserId: string): TelegramIdentityBinding | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_identity_bindings WHERE telegram_user_id = ? AND active = 1',
      [telegramUserId],
    );
    return row ? this.rowToIdentityBinding(row) : undefined;
  }

  getIdentityBindingByPrincipalId(principalId: string): TelegramIdentityBinding | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_identity_bindings WHERE principal_id = ? AND active = 1',
      [principalId],
    );
    return row ? this.rowToIdentityBinding(row) : undefined;
  }

  deleteIdentityBinding(id: string): void {
    dbRun(this.db, 'DELETE FROM telegram_identity_bindings WHERE id = ?', [id]);
  }

  // ─── Workspace Bindings ────────────────────────────────────

  saveWorkspaceBinding(binding: WorkspaceBinding): void {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO telegram_workspace_bindings
       (id, principal_id, workspace_id, workspace_name, preferred, created_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        binding.id,
        binding.principalId,
        binding.workspaceId,
        binding.workspaceName,
        binding.preferred ? 1 : 0,
        binding.createdAt,
        binding.lastAccessedAt,
      ],
    );
  }

  getWorkspaceBindingsByPrincipal(principalId: string): WorkspaceBinding[] {
    const rows = dbAll(
      this.db,
      'SELECT * FROM telegram_workspace_bindings WHERE principal_id = ?',
      [principalId],
    );
    return rows.map((r) => this.rowToWorkspaceBinding(r));
  }

  getWorkspaceBinding(principalId: string, workspaceId: string): WorkspaceBinding | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_workspace_bindings WHERE principal_id = ? AND workspace_id = ?',
      [principalId, workspaceId],
    );
    return row ? this.rowToWorkspaceBinding(row) : undefined;
  }

  deleteWorkspaceBinding(id: string): void {
    dbRun(this.db, 'DELETE FROM telegram_workspace_bindings WHERE id = ?', [id]);
  }

  countWorkspaceBindings(principalId: string): number {
    const row = dbGet(
      this.db,
      'SELECT COUNT(*) as cnt FROM telegram_workspace_bindings WHERE principal_id = ?',
      [principalId],
    );
    return row?.cnt ?? 0;
  }

  clearPreferredWorkspace(principalId: string): void {
    dbRun(
      this.db,
      'UPDATE telegram_workspace_bindings SET preferred = 0 WHERE principal_id = ? AND preferred = 1',
      [principalId],
    );
  }

  // ─── Conversation Bindings ─────────────────────────────────

  saveConversationBinding(binding: ConversationBinding): void {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO telegram_conversation_bindings
       (id, principal_id, workspace_id, telegram_chat_id, telegram_chat_type, telegram_chat_title,
        vestara_conversation_id, vestara_conversation_title, status, created_at, last_activity_at,
        default_model, default_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        binding.id,
        binding.principalId,
        binding.workspaceId,
        binding.telegramChatId,
        binding.telegramChatType,
        binding.telegramChatTitle ?? null,
        binding.vestaraConversationId,
        binding.vestaraConversationTitle ?? null,
        binding.status,
        binding.createdAt,
        binding.lastActivityAt,
        binding.defaultModel ?? null,
        binding.defaultProvider ?? null,
      ],
    );
  }

  getConversationBinding(bindingId: string): ConversationBinding | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_conversation_bindings WHERE id = ?',
      [bindingId],
    );
    return row ? this.rowToConversationBinding(row) : undefined;
  }

  getActiveConversationBinding(telegramChatId: string, principalId: string): ConversationBinding | undefined {
    const row = dbGet(
      this.db,
      'SELECT * FROM telegram_conversation_bindings WHERE telegram_chat_id = ? AND principal_id = ? AND status = ?',
      [telegramChatId, principalId, 'active'],
    );
    return row ? this.rowToConversationBinding(row) : undefined;
  }

  getConversationBindingsByChat(telegramChatId: string): ConversationBinding[] {
    const rows = dbAll(
      this.db,
      'SELECT * FROM telegram_conversation_bindings WHERE telegram_chat_id = ?',
      [telegramChatId],
    );
    return rows.map((r) => this.rowToConversationBinding(r));
  }

  getConversationBindingsByPrincipal(principalId: string): ConversationBinding[] {
    const rows = dbAll(
      this.db,
      'SELECT * FROM telegram_conversation_bindings WHERE principal_id = ?',
      [principalId],
    );
    return rows.map((r) => this.rowToConversationBinding(r));
  }

  countActiveByChat(telegramChatId: string): number {
    const row = dbGet(
      this.db,
      'SELECT COUNT(*) as cnt FROM telegram_conversation_bindings WHERE telegram_chat_id = ? AND status = ?',
      [telegramChatId, 'active'],
    );
    return row?.cnt ?? 0;
  }

  // ─── Row Mappers ───────────────────────────────────────────

  private rowToPairingRequest(row: any): PairingRequest {
    return {
      id: row.id,
      telegramUserId: row.telegram_user_id,
      telegramDisplayName: row.telegram_display_name,
      token: row.token,
      status: row.status as PairingStatus,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      approvedAt: row.approved_at ?? undefined,
      principalId: row.principal_id ?? undefined,
    };
  }

  private rowToIdentityBinding(row: any): TelegramIdentityBinding {
    return {
      id: row.id,
      telegramUserId: row.telegram_user_id,
      telegramDisplayName: row.telegram_display_name,
      principalId: row.principal_id,
      principalName: row.principal_name,
      createdAt: row.created_at,
      active: row.active === 1,
    };
  }

  private rowToWorkspaceBinding(row: any): WorkspaceBinding {
    return {
      id: row.id,
      principalId: row.principal_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      preferred: row.preferred === 1,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
    };
  }

  private rowToConversationBinding(row: any): ConversationBinding {
    return {
      id: row.id,
      principalId: row.principal_id,
      workspaceId: row.workspace_id,
      telegramChatId: row.telegram_chat_id,
      telegramChatType: row.telegram_chat_type as 'direct' | 'group',
      telegramChatTitle: row.telegram_chat_title ?? undefined,
      vestaraConversationId: row.vestara_conversation_id,
      vestaraConversationTitle: row.vestara_conversation_title ?? undefined,
      status: row.status as ConversationBindingStatus,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      defaultModel: row.default_model ?? undefined,
      defaultProvider: row.default_provider ?? undefined,
    };
  }
}
