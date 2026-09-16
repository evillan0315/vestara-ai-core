/**
 * CI-UI-003 — Correlation diagnostics (content block).
 *
 * Read-only identity/provenance for a governed push ↔ CI wait. No secrets,
 * tokens, webhook secrets, or credentials are ever rendered; only identities
 * already carried by the authoritative coordinator projection (CI-OBS-002B2).
 */

import { CIAuthorityNote, CIFact, CISubHeading } from './ci-chrome.js';
import type { CICorrelationView, CIStringField } from './ci-view-model.js';
import { relativeTime, shortSha } from './ci-view-model.js';

function fieldValue(
  field: CIStringField,
  options: { mono?: boolean; shorten?: boolean } = {},
): { value: string; title: string; unavailable: boolean } {
  if (field.availability === 'available') {
    const raw = field.value;
    return {
      value: options.shorten ? shortSha(raw) : raw,
      title: options.mono ? raw : '',
      unavailable: false,
    };
  }
  return { value: `Not available${field.reason ? ` — ${field.reason}` : ''}`, title: '', unavailable: true };
}

function FieldRow({
  label,
  field,
  mono,
  shorten,
}: {
  label: string;
  field: CIStringField;
  mono?: boolean;
  shorten?: boolean;
}) {
  const resolved = fieldValue(field, { mono, shorten });
  return (
    <CIFact
      label={label}
      value={resolved.value}
      mono={mono && !resolved.unavailable}
      tone={resolved.unavailable ? 'unknown' : undefined}
      title={resolved.title}
    />
  );
}

export function CICorrelationDetails({ correlation }: { correlation: CICorrelationView }) {
  return (
    <div>
      <CISubHeading title="Correlation" />
      <FieldRow label="Provider" field={correlation.provider} />
      <FieldRow label="Repository" field={{ availability: 'available', value: correlation.repository }} mono />
      <FieldRow label="Branch" field={{ availability: 'available', value: correlation.branch }} mono />
      <FieldRow
        label="Commit SHA"
        field={{ availability: 'available', value: correlation.commitSha }}
        mono
        shorten
      />
      <FieldRow label="Workflow / run ID" field={correlation.workflowRunId} mono />
      <FieldRow label="WorkflowRun ID" field={correlation.originatingWorkflowRunId} mono />
      <FieldRow label="WorkflowTask ID" field={{ availability: 'available', value: correlation.taskId }} mono />
      <FieldRow label="Correlation ID" field={{ availability: 'available', value: correlation.correlationId }} mono />
      <CIFact label="Suspended" value={relativeTime(availableValue(correlation.suspendedAt))} />
      <CIFact
        label="Resumed"
        value={
          correlation.resumedAt.availability === 'available'
            ? relativeTime(correlation.resumedAt.value)
            : (correlation.resumedAt.reason ?? 'Not resumed')
        }
        tone={correlation.resumedAt.availability === 'available' ? 'positive' : 'unknown'}
      />
      <FieldRow label="Decision reference" field={correlation.decisionRef} mono />
      <CIAuthorityNote>
        Secrets, webhook secrets, access tokens, installation tokens, and credentials are never displayed. This
        view exposes diagnostics only — it cannot mutate workflow task state or reviewer/verifier decisions.
      </CIAuthorityNote>
    </div>
  );
}

function availableValue(field: CIStringField): string | undefined {
  return field.availability === 'available' ? field.value : undefined;
}
