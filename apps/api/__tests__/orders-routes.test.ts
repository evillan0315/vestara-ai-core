import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import type { Order, OrderItem, OrderStatus, User } from '@vestara/workspace';
import { afterEach, describe, expect, it } from 'vitest';
// The route handler is exercised against its compiled output: `routes/types.ts`
// calls `require('../auth')`, which does not exist in vitest's ESM transform.
import { handleOrdersRoute } from '../dist/routes/orders.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

const ORDER_ID = 'ord-test-1';

class FakeUserStore {
  private users: User[] = [
    {
      id: 'user-test-1',
      username: 'test-user',
      role: 'admin',
      token: 'test-token',
      createdAt: new Date().toISOString(),
    },
  ];

  findByToken(token: string): User | undefined {
    return this.users.find((u) => u.token === token);
  }

  findById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  listAll(): User[] {
    return this.users;
  }
}
const ITEM_ID = 'item-test-1';

function makeOrder(patch: Partial<Order> = {}): Order {
  const now = new Date().toISOString();
  return {
    id: ORDER_ID,
    customerId: 'cust-1',
    customerEmail: 'test@example.com',
    customerName: 'Test Customer',
    status: 'pending',
    priority: 'normal',
    items: [
      {
        id: ITEM_ID,
        orderId: ORDER_ID,
        productId: 'prod-1',
        productName: 'Test Product',
        productSku: 'SKU-1',
        quantity: 2,
        unitPrice: 29.99,
        totalPrice: 59.98,
        tax: 5.99,
        discount: 0,
        metadata: {},
      },
    ],
    subtotal: 59.98,
    tax: 5.99,
    shipping: 9.99,
    discount: 0,
    total: 75.96,
    currency: 'USD',
    paymentStatus: 'pending',
    shippingAddress: {
      firstName: 'John',
      lastName: 'Doe',
      address1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
    billingAddress: {
      firstName: 'John',
      lastName: 'Doe',
      address1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
    notes: 'Test order',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function _makeItem(patch: Partial<OrderItem> = {}): OrderItem {
  return {
    id: ITEM_ID,
    orderId: ORDER_ID,
    productId: 'prod-1',
    productName: 'Test Product',
    productSku: 'SKU-1',
    quantity: 2,
    unitPrice: 29.99,
    totalPrice: 59.98,
    tax: 5.99,
    discount: 0,
    metadata: {},
    ...patch,
  };
}

class FakeOrders {
  private orders: Order[] = [makeOrder()];

  listOrders = async (customerId?: string, status?: OrderStatus): Promise<Order[]> => {
    let result = this.orders;
    if (customerId) result = result.filter((o) => o.customerId === customerId);
    if (status) result = result.filter((o) => o.status === status);
    return [...result];
  };

  getOrder = async (id: string): Promise<Order | null> => {
    return this.orders.find((o) => o.id === id) ?? null;
  };

  getOrderStats = async (customerId?: string) => {
    const orders = customerId ? this.orders.filter((o) => o.customerId === customerId) : this.orders;
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      processing: orders.filter((o) => o.status === 'processing').length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      totalRevenue: orders.filter((o) => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.total, 0),
    };
  };

  createOrder = async (input: any): Promise<Order> => {
    const now = new Date().toISOString();
    let subtotal = 0;
    const items: OrderItem[] = input.items.map((item: any, index: number) => {
      const itemId = `item-${Date.now()}-${index}`;
      const totalPrice = item.unitPrice * item.quantity;
      subtotal += totalPrice;
      return {
        ...item,
        id: itemId,
        orderId: `ord-${Date.now()}`,
        totalPrice,
      };
    });

    const tax = subtotal * 0.1;
    const shipping = subtotal > 100 ? 0 : 9.99;
    const discount = 0;
    const total = subtotal + tax + shipping - discount;

    const order: Order = {
      id: `ord-${Date.now()}`,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      status: 'pending',
      priority: input.priority ?? 'normal',
      items,
      subtotal,
      tax,
      shipping,
      discount,
      total,
      currency: input.currency ?? 'USD',
      paymentStatus: 'pending',
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      notes: input.notes,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.push(order);
    return order;
  };

  updateOrderStatus = async (id: string, status: OrderStatus): Promise<Order | null> => {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    this.orders[idx] = { ...this.orders[idx], status, updatedAt: new Date().toISOString() };
    return this.orders[idx];
  };

  updatePaymentStatus = async (
    id: string,
    paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded',
  ): Promise<Order | null> => {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    this.orders[idx] = { ...this.orders[idx], paymentStatus, updatedAt: new Date().toISOString() };
    return this.orders[idx];
  };

  cancelOrder = async (id: string): Promise<Order | null> => {
    return this.updateOrderStatus(id, 'cancelled');
  };
}

function makeContext(): WorkspaceContext {
  return {
    orders: new FakeOrders() as any,
    users: new FakeUserStore() as any,
  } as unknown as WorkspaceContext;
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(
  method: string,
  url: string,
  body?: string,
  headers?: Record<string, string>,
): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = headers ?? { authorization: 'Bearer test-token' };
  if (body) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

function makeUrl(url: string): URL {
  return new URL(url, 'http://localhost');
}

afterEach(() => {
  // Drain queued microtasks so readBody resolvers settle before the next test.
});

describe('orders routes', () => {
  it('serves list of orders', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'GET',
      '/api/orders',
      fakeRequest('GET', '/api/orders'),
      res,
      makeContext(),
      3001,
      makeUrl('/api/orders'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { orders: Order[] }).orders.length).toBe(1);
  });

  it('serves order stats', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'GET',
      '/api/orders/stats',
      fakeRequest('GET', '/api/orders/stats'),
      res,
      makeContext(),
      3001,
      makeUrl('/api/orders/stats'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { stats: { total: number } }).stats.total).toBe(1);
  });

  it('returns 404 for unknown order', async () => {
    const { res, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'GET',
      '/api/orders/unknown',
      fakeRequest('GET', '/api/orders/unknown'),
      res,
      makeContext(),
      3001,
      makeUrl('/api/orders/unknown'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
  });

  it('returns order by id', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'GET',
      `/api/orders/${ORDER_ID}`,
      fakeRequest('GET', `/api/orders/${ORDER_ID}`),
      res,
      makeContext(),
      3001,
      makeUrl(`/api/orders/${ORDER_ID}`),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { order: Order }).order.id).toBe(ORDER_ID);
  });

  it('creates a new order', async () => {
    const { res, body, status } = fakeResponse();
    const newOrder = {
      customerId: 'cust-2',
      customerEmail: 'new@example.com',
      customerName: 'New Customer',
      items: [
        {
          productId: 'prod-2',
          productName: 'Another Product',
          quantity: 1,
          unitPrice: 49.99,
          tax: 4.99,
          discount: 0,
          metadata: {},
        },
      ],
      shippingAddress: {
        firstName: 'Jane',
        lastName: 'Smith',
        address1: '456 Oak Ave',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
      billingAddress: {
        firstName: 'Jane',
        lastName: 'Smith',
        address1: '456 Oak Ave',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
      currency: 'USD',
      priority: 'high',
    };
    const handled = await handleOrdersRoute(
      'POST',
      '/api/orders',
      fakeRequest('POST', '/api/orders', JSON.stringify(newOrder)),
      res,
      makeContext(),
      3001,
      makeUrl('/api/orders'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    const order = (body() as { order: Order }).order;
    expect(order.customerId).toBe('cust-2');
    expect(order.status).toBe('pending');
    expect(order.total).toBeGreaterThan(0);
  });

  it('updates order status', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'PATCH',
      `/api/orders/${ORDER_ID}`,
      fakeRequest('PATCH', `/api/orders/${ORDER_ID}`, JSON.stringify({ status: 'confirmed' })),
      res,
      makeContext(),
      3001,
      makeUrl(`/api/orders/${ORDER_ID}`),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const order = (body() as { order: Order }).order;
    expect(order.status).toBe('confirmed');
  });

  it('updates order payment status', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'PATCH',
      `/api/orders/${ORDER_ID}`,
      fakeRequest('PATCH', `/api/orders/${ORDER_ID}`, JSON.stringify({ paymentStatus: 'paid' })),
      res,
      makeContext(),
      3001,
      makeUrl(`/api/orders/${ORDER_ID}`),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const order = (body() as { order: Order }).order;
    expect(order.paymentStatus).toBe('paid');
  });

  it('cancels an order', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'DELETE',
      `/api/orders/${ORDER_ID}`,
      fakeRequest('DELETE', `/api/orders/${ORDER_ID}`),
      res,
      makeContext(),
      3001,
      makeUrl(`/api/orders/${ORDER_ID}`),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { cancelled: boolean }).cancelled).toBe(true);
  });

  it('returns 503 when orders service unavailable', async () => {
    const { res, body, status } = fakeResponse();
    const ctx = {} as unknown as WorkspaceContext;
    const handled = await handleOrdersRoute(
      'GET',
      '/api/orders',
      fakeRequest('GET', '/api/orders'),
      res,
      ctx,
      3001,
      makeUrl('/api/orders'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(503);
    expect((body() as { error: string }).error).toBe('Order service not available');
  });

  it('filters orders by customerId', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'GET',
      '/api/orders',
      fakeRequest('GET', '/api/orders?customerId=cust-1'),
      res,
      makeContext(),
      3001,
      makeUrl('/api/orders?customerId=cust-1'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { orders: Order[] }).orders.length).toBe(1);
  });

  it('filters orders by status', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleOrdersRoute(
      'GET',
      '/api/orders',
      fakeRequest('GET', '/api/orders?status=pending'),
      res,
      makeContext(),
      3001,
      makeUrl('/api/orders?status=pending'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { orders: Order[] }).orders.length).toBe(1);
  });
});
