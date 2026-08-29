import type * as http from 'node:http';
import { type CustomTheme, safeValidateCustomTheme, safeValidateThemeArray } from '@vestara/shared';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { getActor, json, readBody } from './types';

const CUSTOM_THEMES_KEY = 'vestara-custom-themes';

interface StoredTheme extends CustomTheme {}

async function getCustomThemes(ctx: WorkspaceContext): Promise<StoredTheme[]> {
  const configuration = ctx.settings.resolve();
  for (const setting of configuration.settings) {
    if (setting.key === CUSTOM_THEMES_KEY && typeof setting.value === 'string' && setting.value) {
      try {
        const parsed = JSON.parse(setting.value);
        if (Array.isArray(parsed)) {
          return parsed as StoredTheme[];
        }
      } catch {
        // Invalid stored themes
      }
    }
  }
  return [];
}

async function setCustomThemes(
  ctx: WorkspaceContext,
  themes: StoredTheme[],
  req: http.IncomingMessage,
  actorId: string,
  actorName: string,
): Promise<boolean> {
  try {
    await ctx.settings.save({
      section: 'appearance',
      overrides: { [CUSTOM_THEMES_KEY]: JSON.stringify(themes) },
    });

    logAudit(
      ctx.audit,
      req,
      actorId,
      actorName,
      AuditAction.SETTINGS_UPDATE,
      'settings',
      undefined,
      JSON.stringify({ [CUSTOM_THEMES_KEY]: themes.length }),
    );

    return true;
  } catch {
    return false;
  }
}

export async function handleThemeBuilderRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  // GET /api/settings/theme-builder - List all custom themes
  if (method === 'GET' && p === '/api/settings/theme-builder') {
    const themes = await getCustomThemes(ctx);
    json(res, 200, { themes });
    return true;
  }

  // GET /api/settings/theme-builder/:id - Get single theme
  const getMatch = p.match(/^\/api\/settings\/theme-builder\/([^/]+)$/);
  if (method === 'GET' && getMatch) {
    const id = getMatch[1];
    const themes = await getCustomThemes(ctx);
    const theme = themes.find((t) => t.id === id);
    if (!theme) {
      json(res, 404, { error: 'Theme not found' });
      return true;
    }
    json(res, 200, { theme });
    return true;
  }

  // POST /api/settings/theme-builder - Create theme
  if (method === 'POST' && p === '/api/settings/theme-builder') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};

    const validation = safeValidateCustomTheme(body);
    if (!validation.success) {
      json(res, 400, { error: 'Invalid theme data', details: validation.error.errors });
      return true;
    }

    const themes = await getCustomThemes(ctx);
    const newTheme = validation.data;
    const updatedThemes = [...themes, newTheme];

    const actor = getActor(req, ctx);
    const success = await setCustomThemes(ctx, updatedThemes, req, actor.id, actor.name);

    if (!success) {
      json(res, 500, { error: 'Failed to save theme' });
      return true;
    }

    json(res, 201, { theme: newTheme });
    return true;
  }

  // PUT /api/settings/theme-builder/:id - Update theme
  const putMatch = p.match(/^\/api\/settings\/theme-builder\/([^/]+)$/);
  if (method === 'PUT' && putMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = putMatch[1];
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};

    const validation = safeValidateCustomTheme(body);
    if (!validation.success) {
      json(res, 400, { error: 'Invalid theme data', details: validation.error.errors });
      return true;
    }

    if (validation.data.id !== id) {
      json(res, 400, { error: 'Theme ID mismatch' });
      return true;
    }

    const themes = await getCustomThemes(ctx);
    const index = themes.findIndex((t) => t.id === id);
    if (index === -1) {
      json(res, 404, { error: 'Theme not found' });
      return true;
    }

    const existing = themes[index];
    if (existing.isBuiltIn) {
      json(res, 403, { error: 'Cannot modify built-in themes' });
      return true;
    }

    const updatedThemes = [...themes];
    updatedThemes[index] = { ...validation.data, updatedAt: new Date().toISOString() };

    const actor = getActor(req, ctx);
    const success = await setCustomThemes(ctx, updatedThemes, req, actor.id, actor.name);

    if (!success) {
      json(res, 500, { error: 'Failed to update theme' });
      return true;
    }

    json(res, 200, { theme: updatedThemes[index] });
    return true;
  }

  // DELETE /api/settings/theme-builder/:id - Delete theme
  if (method === 'DELETE' && putMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = putMatch[1];

    const themes = await getCustomThemes(ctx);
    const theme = themes.find((t) => t.id === id);
    if (!theme) {
      json(res, 404, { error: 'Theme not found' });
      return true;
    }

    if (theme.isBuiltIn) {
      json(res, 403, { error: 'Cannot delete built-in themes' });
      return true;
    }

    const updatedThemes = themes.filter((t) => t.id !== id);

    const actor = getActor(req, ctx);
    const success = await setCustomThemes(ctx, updatedThemes, req, actor.id, actor.name);

    if (!success) {
      json(res, 500, { error: 'Failed to delete theme' });
      return true;
    }

    json(res, 200, { deleted: true, id });
    return true;
  }

  // POST /api/settings/theme-builder/import - Import themes from JSON
  if (method === 'POST' && p === '/api/settings/theme-builder/import') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};

    const { themes: themesToImport, strategy = 'add-new' } = body as {
      themes: unknown[];
      strategy?: 'replace-all' | 'add-new' | 'update-existing';
    };

    if (!Array.isArray(themesToImport)) {
      json(res, 400, { error: 'themes must be an array' });
      return true;
    }

    const validation = safeValidateThemeArray(themesToImport);
    if (!validation.success) {
      json(res, 400, { error: 'Invalid theme data', details: validation.error.errors });
      return true;
    }

    const existingThemes = await getCustomThemes(ctx);
    let updatedThemes: StoredTheme[];

    switch (strategy) {
      case 'replace-all':
        updatedThemes = validation.data;
        break;
      case 'add-new': {
        const existingIds = new Set(existingThemes.map((t) => t.id));
        const newThemes = validation.data.filter((t) => !existingIds.has(t.id));
        updatedThemes = [...existingThemes, ...newThemes];
        break;
      }
      case 'update-existing': {
        const themeMap = new Map(validation.data.map((t) => [t.id, t]));
        updatedThemes = existingThemes.map((t) => themeMap.get(t.id) || t);
        const newThemes = validation.data.filter((t) => !existingThemes.some((e) => e.id === t.id));
        updatedThemes = [...updatedThemes, ...newThemes];
        break;
      }
      default:
        json(res, 400, { error: 'Invalid strategy' });
        return true;
    }

    const actor = getActor(req, ctx);
    const success = await setCustomThemes(ctx, updatedThemes, req, actor.id, actor.name);

    if (!success) {
      json(res, 500, { error: 'Failed to import themes' });
      return true;
    }

    json(res, 200, { imported: validation.data.length, themes: updatedThemes });
    return true;
  }

  return false;
}
