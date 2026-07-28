import type { UnderstandingProducer } from '@vestara/understanding';
import { LanguageProducer } from './language-producer';
import { FrameworkProducer } from './framework-producer';
import { ArchitectureProducer } from './architecture-producer';
import { MaturityProducer } from './maturity-producer';
import { RiskProducer } from './risk-producer';
import { HealthProducer } from './health-producer';
import { ActivityProducer } from './activity-producer';

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

export { LanguageProducer } from './language-producer';
export { FrameworkProducer } from './framework-producer';
export { ArchitectureProducer } from './architecture-producer';
export { MaturityProducer } from './maturity-producer';
export { RiskProducer } from './risk-producer';
export { HealthProducer } from './health-producer';
export { ActivityProducer } from './activity-producer';
