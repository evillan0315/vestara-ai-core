import type { Order, OrderItem, OrderStatus, PaymentStatus } from './order-types';

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

export class OrderStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async saveOrder(order: Order): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO orders (
        id, customer_id, customer_email, customer_name, status, priority,
        subtotal, tax, shipping, discount, total, currency, payment_status,
        payment_method, shipping_address, billing_address, notes, metadata,
        created_at, updated_at, confirmed_at, shipped_at, delivered_at, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        order.customerId,
        order.customerEmail,
        order.customerName,
        order.status,
        order.priority,
        order.subtotal,
        order.tax,
        order.shipping,
        order.discount,
        order.total,
        order.currency,
        order.paymentStatus,
        order.paymentMethod ?? '',
        JSON.stringify(order.shippingAddress),
        JSON.stringify(order.billingAddress),
        order.notes ?? '',
        JSON.stringify(order.metadata ?? {}),
        order.createdAt,
        order.updatedAt,
        order.confirmedAt ?? null,
        order.shippedAt ?? null,
        order.deliveredAt ?? null,
        order.cancelledAt ?? null,
      ],
    );

    for (const item of order.items) {
      await this.saveOrderItem(item);
    }
  }

  async saveOrderItem(item: OrderItem): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO order_items (
        id, order_id, product_id, product_name, product_sku, quantity,
        unit_price, total_price, tax, discount, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.orderId,
        item.productId,
        item.productName,
        item.productSku ?? '',
        item.quantity,
        item.unitPrice,
        item.totalPrice,
        item.tax,
        item.discount,
        JSON.stringify(item.metadata ?? {}),
      ],
    );
  }

  async listOrders(customerId?: string, status?: OrderStatus): Promise<Order[]> {
    let sql = 'SELECT * FROM orders';
    const params: any[] = [];
    const wheres: string[] = [];

    if (customerId) {
      wheres.push('customer_id = ?');
      params.push(customerId);
    }
    if (status) {
      wheres.push('status = ?');
      params.push(status);
    }

    if (wheres.length > 0) sql += ` WHERE ${wheres.join(' AND ')}`;
    sql += ' ORDER BY created_at DESC';

    return dbAll(this.db, sql, params).map(this._rowToOrder);
  }

  async getOrder(id: string): Promise<Order | null> {
    const row = dbGet(this.db, 'SELECT * FROM orders WHERE id = ?', [id]);
    if (!row) return null;

    const order = this._rowToOrder(row);
    order.items = await this.getOrderItems(id);
    return order;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return dbAll(this.db, 'SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]).map(
      this._rowToOrderItem,
    );
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
    const now = new Date().toISOString();
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [status, now];

    if (status === 'confirmed') {
      updates.push('confirmed_at = ?');
      params.push(now);
    } else if (status === 'shipped') {
      updates.push('shipped_at = ?');
      params.push(now);
    } else if (status === 'delivered') {
      updates.push('delivered_at = ?');
      params.push(now);
    } else if (status === 'cancelled') {
      updates.push('cancelled_at = ?');
      params.push(now);
    }

    params.push(id);
    dbRun(this.db, `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<void> {
    dbRun(this.db, 'UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?', [
      paymentStatus,
      new Date().toISOString(),
      id,
    ]);
  }

  async deleteOrder(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM order_items WHERE order_id = ?', [id]);
    dbRun(this.db, 'DELETE FROM orders WHERE id = ?', [id]);
  }

  async getOrderStats(customerId?: string): Promise<{
    total: number;
    pending: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
    totalRevenue: number;
  }> {
    let sql = 'SELECT * FROM orders';
    const params: any[] = [];

    if (customerId) {
      sql += ' WHERE customer_id = ?';
      params.push(customerId);
    }

    const orders = dbAll(this.db, sql, params).map(this._rowToOrder);

    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      processing: orders.filter((o) => o.status === 'processing').length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      totalRevenue: orders.filter((o) => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.total, 0),
    };
  }

  private _rowToOrder(r: any): Order {
    return {
      id: r.id,
      customerId: r.customer_id,
      customerEmail: r.customer_email,
      customerName: r.customer_name,
      status: r.status,
      priority: r.priority,
      items: [],
      subtotal: r.subtotal,
      tax: r.tax,
      shipping: r.shipping,
      discount: r.discount,
      total: r.total,
      currency: r.currency,
      paymentStatus: r.payment_status,
      paymentMethod: r.payment_method || undefined,
      shippingAddress: JSON.parse(r.shipping_address ?? '{}'),
      billingAddress: JSON.parse(r.billing_address ?? '{}'),
      notes: r.notes || undefined,
      metadata: JSON.parse(r.metadata ?? '{}'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      confirmedAt: r.confirmed_at || undefined,
      shippedAt: r.shipped_at || undefined,
      deliveredAt: r.delivered_at || undefined,
      cancelledAt: r.cancelled_at || undefined,
    };
  }

  private _rowToOrderItem(r: any): OrderItem {
    return {
      id: r.id,
      orderId: r.order_id,
      productId: r.product_id,
      productName: r.product_name,
      productSku: r.product_sku || undefined,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      totalPrice: r.total_price,
      tax: r.tax,
      discount: r.discount,
      metadata: JSON.parse(r.metadata ?? '{}'),
    };
  }
}
