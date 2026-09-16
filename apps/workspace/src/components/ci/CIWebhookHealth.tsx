/**
 * CI-UI-003 — GitHub webhook ingress health (content block).
 *
 * Health is never inferred from the absence of events or from credential
 * presence alone. Without a delivery read boundary the honest state is
 * `unknown`.
 *
 * The block displays health state only; it never renders the webhook secret or
 * any credential.
 */

import { CIAuthorityNote, CIFact, CISubHeading, CIToneChip } from './ci-chrome.js';
import type { CITone, CIWebhookHealthView } from './ci-view-model.js';
import { relativeTime } from './ci-view-model.js';

const STATE: Record<CIWebhookHealthView['state'], { tone: CITone; label: string }> = {
  configured: { tone: 'info', label: 'Configured' },
  receiving: { tone: 'positive', label: 'Receiving' },
  error: { tone: 'negative', label: 'Error' },
  unknown: { tone: 'unknown', label: 'Unknown' },
};

export function CIWebhookHealth({ health }: { health: CIWebhookHealthView }) {
  const state = STATE[health.state];
  return (
    <div>
      <CISubHeading title="Webhook Ingress" actions={<CIToneChip tone={state.tone}>{state.label}</CIToneChip>} />
      <CIFact label="Health state" value={state.label} tone={state.tone} />
      <CIFact label="Last delivery" value={relativeTime(health.lastDeliveryAt)} />
      <CIFact
        label="Signature secret"
        value={
          health.signatureConfigured === undefined
            ? 'Unknown'
            : health.signatureConfigured
              ? 'Configured'
              : 'Not configured'
        }
      />
      <CIFact
        label="Detail"
        value={health.detail ?? (health.state === 'unknown' ? 'No delivery read boundary is exposed' : '—')}
      />
      <CIAuthorityNote>
        Ingress verifies the HMAC signature and deduplicates deliveries before inspection. Absence of a recent
        delivery ≠ unhealthy. Secrets and tokens are never exposed here.
      </CIAuthorityNote>
    </div>
  );
}
