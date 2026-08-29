import type * as http from 'node:http';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { getActor, json, readBody } from './types';

export async function handleOrdersRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  url: URL,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/orders') {
    if (!ctx.orders) {
      json(res, 503, { error: 'Order service not available' });
      return true;
    }
    const customerId = url.searchParams.get('customerId') || undefined;
    const status = url.searchParams.get('status') as
      | 'pending'
      | 'confirmed'
      | 'processing'
      | 'shipped'
      | 'delivered'
      | 'cancelled'
      | 'refunded'
      | undefined;
    const orders = await ctx.orders.listOrders(customerId, status);
    json(res, 200, { orders });
    return true;
  }

  if (method === 'GET' && p === '/api/orders/stats') {
    if (!ctx.orders) {
      json(res, 503, { error: 'Order service not available' });
      return true;
    }
    const customerId = url.searchParams.get('customerId') || undefined;
    const stats = await ctx.orders.getOrderStats(customerId);
    json(res, 200, { stats });
    return true;
  }

  const orderDetail = p.match(/^\/api\/orders\/([^/]+)$/);
  if (method === 'GET' && orderDetail) {
    if (!ctx.orders) {
      json(res, 503, { error: 'Order service not available' });
      return true;
    }
    const id = decodeURIComponent(orderDetail[1]);
    const order = await ctx.orders.getOrder(id);
    if (!order) {
      json(res, 404, { error: 'order not found' });
      return true;
    }
    json(res, 200, { order });
    return true;
  }

  if (method === 'POST' && p === '/api/orders') {
    if (!ctx.orders) {
      json(res, 503, { error: 'Order service not available' });
      return true;
    }
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const actor = getActor(req, ctx);

    const order = await ctx.orders.createOrder({
      customerId: body.customerId || 'unknown',
      customerEmail: body.customerEmail || 'unknown@example.com',
      customerName: body.customerName || 'Unknown Customer',
      items: body.items || [],
      shippingAddress: body.shippingAddress || {
        firstName: '',
        lastName: '',
        address1: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      },
      billingAddress: body.billingAddress || {
        firstName: '',
        lastName: '',
        address1: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      },
      currency: body.currency || 'USD',
      priority: body.priority || 'normal',
      notes: body.notes,
      metadata: body.metadata,
    });

    logAudit(
      ctx.audit,
      req,
      actor.id,
      actor.name,
      AuditAction.ORDER_CREATE,
      'order',
      order.id,
      `${order.customerName} - ${order.total} ${order.currency}`,
    );
    json(res, 201, { order });
    return true;
  }

  if (method === 'PATCH' && orderDetail) {
    if (!ctx.orders) {
      json(res, 503, { error: 'Order service not available' });
      return true;
    }
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const id = decodeURIComponent(orderDetail[1]);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const actor = getActor(req, ctx);

    if (body.status) {
      const order = await ctx.orders.updateOrderStatus(id, body.status);
      if (!order) {
        json(res, 404, { error: 'order not found' });
        return true;
      }
      logAudit(
        ctx.audit,
        req,
        actor.id,
        actor.name,
        AuditAction.ORDER_STATUS_CHANGE,
        'order',
        id,
        `Status changed to ${body.status}`,
      );
      json(res, 200, { order });
      return true;
    }

    if (body.paymentStatus) {
      const order = await ctx.orders.updatePaymentStatus(id, body.paymentStatus);
      if (!order) {
        json(res, 404, { error: 'order not found' });
        return true;
      }
      logAudit(
        ctx.audit,
        req,
        actor.id,
        actor.name,
        AuditAction.ORDER_PAYMENT_CHANGE,
        'order',
        id,
        `Payment status changed to ${body.paymentStatus}`,
      );
      json(res, 200, { order });
      return true;
    }

    json(res, 400, { error: 'No valid update fields provided' });
    return true;
  }

  if (method === 'DELETE' && orderDetail) {
    if (!ctx.orders) {
      json(res, 503, { error: 'Order service not available' });
      return true;
    }
    if (!requireRole(req, ctx, 'admin', res)) return true;
    const id = decodeURIComponent(orderDetail[1]);
    const actor = getActor(req, ctx);
    await ctx.orders.cancelOrder(id);
    logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.ORDER_CANCEL, 'order', id, 'Order cancelled');
    json(res, 200, { cancelled: true });
    return true;
  }

  return false;
}
