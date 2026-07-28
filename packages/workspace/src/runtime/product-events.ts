import type { EventBus } from '@vestara/event-bus';

export type ProductEventType =
  | 'agent.thinking'
  | 'agent.planning'
  | 'agent.executing'
  | 'agent.completed'
  | 'project.started'
  | 'project.completed'
  | 'workflow.started'
  | 'workflow.step.changed'
  | 'workflow.completed'
  | 'file.created'
  | 'file.modified'
  | 'decision.saved'
  | 'memory.stored'
  | 'project.created'
  | 'conversation.response'
  | 'system.ready'
  | 'workspace.understood';

export interface ProductEvent {
  type: ProductEventType;
  timestamp: string;
  payload: Record<string, unknown>;
  actor: string;
}

const PRODUCT_EVENT_SOURCE = 'product-events';

export class ProductEventTranslator {
  private readonly eventBus?: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

  emit(event: ProductEvent): void {
    if (!this.eventBus) return;
    void this.eventBus.emit({
      type: event.type,
      source: PRODUCT_EVENT_SOURCE,
      payload: {
        ...event.payload,
        _productEvent: true,
        _actor: event.actor,
      },
    });
  }
}
