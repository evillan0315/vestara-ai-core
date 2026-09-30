import type * as http from 'node:http';
import {
  InventoryMaterializationUnavailableError,
  inventoryDetail,
  loadInventoryR3Projection,
} from '@vestara/knowledge-assertions';
import { json } from './types';

export async function handleInventoryRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx?: unknown,
): Promise<boolean> {
  if (method !== 'GET') return false;

  try {
    const projection = loadInventoryR3Projection();
    if (p === '/api/inventory') {
      json(res, 200, { summary: projection.summary, rows: projection.rows });
      return true;
    }

    const detailMatch = p.match(/^\/api\/inventory\/([^/]+)$/);
    if (detailMatch) {
      const targetId = decodeURIComponent(detailMatch[1]);
      const detail = inventoryDetail(projection, targetId);
      if (!detail) {
        json(res, 404, { error: { code: 'INVENTORY_TARGET_NOT_FOUND', message: 'Inventory target not found.' } });
        return true;
      }
      json(res, 200, { detail });
      return true;
    }
  } catch (error) {
    if (error instanceof InventoryMaterializationUnavailableError) {
      json(res, 503, { error: { code: error.code, message: error.message } });
      return true;
    }
    throw error;
  }

  return false;
}
