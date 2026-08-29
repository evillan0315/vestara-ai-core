import type { EventBus } from '@vestara/event-bus';
import type { OrderStorage } from './order-storage';
import type { Address, Order, OrderItem, OrderPriority, OrderStatus, PaymentStatus } from './order-types';

export class OrderService {
  readonly id = 'vestara-orders';
  private storage: OrderStorage;
  private eventBus?: EventBus;

  constructor(opts: { storage: OrderStorage; eventBus?: EventBus }) {
    this.storage = opts.storage;
    this.eventBus = opts.eventBus;
  }

  async createOrder(input: {
    customerId: string;
    customerEmail: string;
    customerName: string;
    items: Omit<OrderItem, 'id' | 'orderId'>[];
    shippingAddress: Address;
    billingAddress: Address;
    currency?: string;
    priority?: OrderPriority;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Order> {
    const now = new Date().toISOString();
    const orderId = `ord-${Date.now()}`;

    let subtotal = 0;
    const items: OrderItem[] = input.items.map((item, index) => {
      const itemId = `item-${Date.now()}-${index}`;
      const totalPrice = item.unitPrice * item.quantity;
      subtotal += totalPrice;
      return {
        ...item,
        id: itemId,
        orderId,
        totalPrice,
      };
    });

    const tax = subtotal * 0.1;
    const shipping = subtotal > 100 ? 0 : 9.99;
    const discount = 0;
    const total = subtotal + tax + shipping - discount;

    const order: Order = {
      id: orderId,
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

    await this.storage.saveOrder(order);
    await this.eventBus?.emit({
      type: 'order:created',
      source: 'order-service',
      payload: { orderId: order.id, customerId: order.customerId, total: order.total },
      // ARX-015 M2: order.id is not an execution identity — correlation absent (fail-closed)
      metadata: {},
    });

    return order;
  }

  async listOrders(customerId?: string, status?: OrderStatus): Promise<Order[]> {
    return this.storage.listOrders(customerId, status);
  }

  async getOrder(id: string): Promise<Order | null> {
    return this.storage.getOrder(id);
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const existing = await this.storage.getOrder(id);
    if (!existing) return null;

    await this.storage.updateOrderStatus(id, status);
    const updated = await this.storage.getOrder(id);

    if (updated) {
      await this.eventBus?.emit({
        type: 'order:status_changed',
        source: 'order-service',
        payload: { orderId: id, previousStatus: existing.status, newStatus: status },
        // ARX-015 M2: order.id is not an execution identity — correlation absent (fail-closed)
        metadata: {},
      });
    }

    return updated;
  }

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Order | null> {
    const existing = await this.storage.getOrder(id);
    if (!existing) return null;

    await this.storage.updatePaymentStatus(id, paymentStatus);
    const updated = await this.storage.getOrder(id);

    if (updated) {
      await this.eventBus?.emit({
        type: 'order:payment_changed',
        source: 'order-service',
        payload: { orderId: id, previousStatus: existing.paymentStatus, newStatus: paymentStatus },
        // ARX-015 M2: order.id is not an execution identity — correlation absent (fail-closed)
        metadata: {},
      });
    }

    return updated;
  }

  async cancelOrder(id: string): Promise<Order | null> {
    return this.updateOrderStatus(id, 'cancelled');
  }

  async getOrderStats(customerId?: string) {
    return this.storage.getOrderStats(customerId);
  }
}
