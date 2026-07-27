import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ServiceRegistry } from '@vestara/service-registry';
import type { VestaraService } from '@vestara/shared';

export interface RecoveryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  escalationAfterMs: number;
  escalationAction: 'restart' | 'notify' | 'degrade' | 'halt';
}

export interface RecoveryAttempt {
  serviceId: string;
  attempt: number;
  startedAt: string;
  result: 'success' | 'failed';
  error?: string;
}

export interface RecoveryManager {
  registerPolicy(serviceId: string, policy: RecoveryPolicy): void;
  triggerRecovery(serviceId: string, error: Error): Promise<RecoveryAttempt>;
  getAttemptHistory(serviceId: string): RecoveryAttempt[];
  resetAttempts(serviceId: string): void;
}

export class DefaultRecoveryManager implements RecoveryManager {
  private policies: Map<string, RecoveryPolicy> = new Map();
  private attempts: Map<string, RecoveryAttempt[]> = new Map();
  private registry: ServiceRegistry;
  private eventBus: EventBus;
  private logger: Logger;

  constructor(opts: { registry: ServiceRegistry; eventBus: EventBus; logger: Logger }) {
    this.registry = opts.registry;
    this.eventBus = opts.eventBus;
    this.logger = opts.logger.child({ component: 'recovery-manager' });

    this.logger.info('Recovery manager initialized');
  }

  registerPolicy(serviceId: string, policy: RecoveryPolicy): void {
    this.policies.set(serviceId, policy);
    this.logger.debug('Recovery policy registered', { serviceId, maxRetries: policy.maxRetries });
  }

  async triggerRecovery(serviceId: string, error: Error): Promise<RecoveryAttempt> {
    const policy = this.policies.get(serviceId) ?? {
      maxRetries: 3,
      retryDelayMs: 1000,
      backoffMultiplier: 2,
      escalationAfterMs: 30000,
      escalationAction: 'restart' as const,
    };

    const history = this.attempts.get(serviceId) ?? [];
    const attemptNumber = history.length + 1;
    const startedAt = new Date().toISOString();

    this.logger.warn('Recovery triggered', { serviceId, attempt: attemptNumber, error: error.message });

    if (attemptNumber > policy.maxRetries) {
      const failed: RecoveryAttempt = {
        serviceId,
        attempt: attemptNumber,
        startedAt,
        result: 'failed',
        error: `Max retries (${policy.maxRetries}) exceeded: ${error.message}`,
      };
      history.push(failed);
      this.attempts.set(serviceId, history);

      await this.eventBus.emit({
        type: 'recovery:exhausted',
        source: 'recovery-manager',
        payload: { serviceId, attempt: attemptNumber, action: policy.escalationAction },
      });

      await this.executeEscalation(serviceId, policy.escalationAction);
      return failed;
    }

    const delay = policy.retryDelayMs * policy.backoffMultiplier ** (attemptNumber - 1);
    this.logger.info('Recovery delay', { serviceId, delayMs: delay });

    await this.delay(delay);

    try {
      const service = this.registry.get<VestaraService>(serviceId);
      if (!service) {
        throw new Error(`Service not found: ${serviceId}`);
      }

      await service.stop();
      await service.dispose();
      await service.initialize();
      await service.start();

      const success: RecoveryAttempt = {
        serviceId,
        attempt: attemptNumber,
        startedAt,
        result: 'success',
      };
      history.push(success);
      this.attempts.set(serviceId, history);

      await this.eventBus.emit({
        type: 'recovery:success',
        source: 'recovery-manager',
        payload: { serviceId, attempt: attemptNumber },
      });

      this.logger.info('Recovery successful', { serviceId, attempt: attemptNumber });
      return success;
    } catch (recoveryError) {
      const msg = recoveryError instanceof Error ? recoveryError.message : 'Recovery failed';
      const attempt: RecoveryAttempt = {
        serviceId,
        attempt: attemptNumber,
        startedAt,
        result: 'failed',
        error: msg,
      };
      history.push(attempt);
      this.attempts.set(serviceId, history);

      await this.eventBus.emit({
        type: 'recovery:failed',
        source: 'recovery-manager',
        payload: { serviceId, attempt: attemptNumber, error: msg },
      });

      return attempt;
    }
  }

  getAttemptHistory(serviceId: string): RecoveryAttempt[] {
    return this.attempts.get(serviceId) ?? [];
  }

  resetAttempts(serviceId: string): void {
    this.attempts.delete(serviceId);
    this.logger.debug('Recovery attempts reset', { serviceId });
  }

  private async executeEscalation(serviceId: string, action: string): Promise<void> {
    this.logger.warn('Recovery escalation', { serviceId, action });
    switch (action) {
      case 'restart':
        this.triggerRecovery(serviceId, new Error('Escalation restart')).catch(() => {});
        break;
      case 'notify':
        await this.eventBus.emit({
          type: 'recovery:escalation.notify',
          source: 'recovery-manager',
          payload: { serviceId },
        });
        break;
      case 'halt':
        await this.eventBus.emit({
          type: 'recovery:escalation.halt',
          source: 'recovery-manager',
          payload: { serviceId },
        });
        process.exit(1);
        break;
      default:
        break;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
