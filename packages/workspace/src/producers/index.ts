import type { UnderstandingProducer } from '@vestara/understanding';
import { ActivityProducer } from './activity-producer';
import { ArchitectureProducer } from './architecture-producer';
import { FrameworkProducer } from './framework-producer';
import { HealthProducer } from './health-producer';
import { LanguageProducer } from './language-producer';
import { MaturityProducer } from './maturity-producer';
import { RiskProducer } from './risk-producer';

export function createDefaultProducers(): UnderstandingProducer[] {
  return [
    new LanguageProducer(),
    new FrameworkProducer(),
    new ArchitectureProducer(),
    new MaturityProducer(),
    new RiskProducer(),
    new HealthProducer(),
    new ActivityProducer(),
  ];
}

export { ActivityProducer } from './activity-producer';
export { ArchitectureProducer } from './architecture-producer';
export { FrameworkProducer } from './framework-producer';
export { HealthProducer } from './health-producer';
export { LanguageProducer } from './language-producer';
export { MaturityProducer } from './maturity-producer';
export { RiskProducer } from './risk-producer';
