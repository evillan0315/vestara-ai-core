import type { AssistantRole, Provider } from '@vestara/types';
import { ProviderSchema } from '@vestara/types';

type ProviderConfig = { available: boolean; onDemand: boolean; endpoint?: string };
export class AIRouter {
  private configs: Record<Provider, ProviderConfig> = {
    opencode: { available: true, onDemand: false, endpoint: 'http://localhost:8081' },
    ollama: { available: false, onDemand: true, endpoint: 'http://localhost:11434' },
    openai: { available: false, onDemand: false },
    anthropic: { available: false, onDemand: false },
    local: { available: true, onDemand: false },
  };
  async resolveProvider(preferred?: Provider): Promise<Provider> {
    if (preferred) {
      const p = ProviderSchema.safeParse(preferred);
      if (p.success && this.configs[p.data].available) return p.data;
    }
    if (this.configs.opencode.available) return 'opencode';
    if (this.configs.local.available) return 'local';
    if (this.configs.ollama.onDemand) {
      const started = await this.attemptOllamaStart();
      if (started) return 'ollama';
    }
    throw new Error('No provider available');
  }
  private async attemptOllamaStart(): Promise<boolean> {
    try {
      const res = await fetch(`${this.configs.ollama.endpoint}/api/tags`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  }
  async route(message: string, role: AssistantRole, provider: Provider) {
    return { provider, role, content: `Routed to ${role} via ${provider}: ${message.slice(0, 120)}` };
  }
}
