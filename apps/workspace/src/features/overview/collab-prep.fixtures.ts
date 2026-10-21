/**
 * VES-OVERVIEW-001: Collaboration Prep Fixture Dataset
 *
 * Typed local fixture for the Andy McCraw Oct 21 collaboration call.
 * No API or mock-server projection exists for proposal records, so the
 * Overview card renders from this fixture (per data governance: API first,
 * then mock server, then local fixture — never hardcoded arrays in JSX).
 *
 * Source of truth for meeting facts:
 * @see docs/proposals/PROP-ANDY-MCCRAW-COLLAB-RECORD.md
 * @see docs/proposals/PROP-ANDY-MCCRAW-ONEPAGER-001.md
 */

export interface CollabDocLink {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  /** Workspace-relative repo path, opened via the Files surface. */
  readonly path: string;
}

export interface CollabDemoStep {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

export interface CollabPrepViewModel {
  readonly meetingId: string;
  readonly title: string;
  readonly counterpart: string;
  readonly schedule: string;
  readonly venue: string;
  /** Google Meet join URL from the calendar invitation. */
  readonly meetUrl: string;
  /** One-line agenda summary (full agenda lives in the collab record §2). */
  readonly agendaHint: string;
  readonly status: string;
  readonly docs: readonly CollabDocLink[];
  readonly demoSteps: readonly CollabDemoStep[];
  readonly questionCount: number;
  readonly questionsHint: string;
}

const DOCS_BASE = 'docs/proposals';

export const collabPrepFixture: CollabPrepViewModel = {
  meetingId: 'andy-mccraw-2026-10-21',
  title: 'Andy McCraw — collaboration call',
  counterpart: 'Eddie Villanueva + Andy McCraw (ex-Welligent CSO)',
  schedule: 'Wed Oct 21, 2026 · ~9–11 AM EDT (evening Manila)',
  venue: 'Google Meet — invite accepted (3 guests, 3 yes)',
  meetUrl: 'https://meet.google.com/vyo-giij-mho',
  agendaHint: 'Reunion first (El Guapo session) → Vestara session: market, problem, 10x, path → wedge exploration',
  status: 'Exploratory — no commitment or terms on this call',
  docs: [
    {
      id: 'collab-record',
      label: 'Collaboration exploration record',
      detail: 'PROP-ANDY-MCCRAW-COLLAB-001 · LinkedIn source + theses',
      path: `${DOCS_BASE}/PROP-ANDY-MCCRAW-COLLAB-RECORD.md`,
    },
    {
      id: 'onepager',
      label: 'One-pager + demo checklist',
      detail: 'PROP-ANDY-MCCRAW-ONEPAGER-001 · pitch, 5 stops, 7 questions',
      path: `${DOCS_BASE}/PROP-ANDY-MCCRAW-ONEPAGER-001.md`,
    },
    {
      id: 'clinical-os-plan',
      label: 'Clinical OS build plan (ClinicalNotes.ai)',
      detail: 'VES-CLINICAL-001 · Intelligent OS for Behavioral Health + templates',
      path: 'docs/plans/VES-CLINICAL-001-clinical-notes-os-plan.md',
    },
  ],
  demoSteps: [
    { id: 'shell', title: 'Desktop shell', detail: 'Boot → login → dock/windows' },
    { id: 'activity', title: 'Activity Room', detail: 'Governed record of agent actions' },
    { id: 'conversation', title: 'Conversation', detail: 'Provider-routed, persisted turns' },
    { id: 'verification', title: 'Agents + verification', detail: 'Build → verify → evidence bundles' },
    { id: 'bridge', title: 'Specialty bridge', detail: 'EHR ↔ wedge ↔ Vestara agents (whiteboard)' },
  ],
  questionCount: 7,
  questionsHint:
    'Optometry findings · ClinicalNotes.ai · back-office wedge · voice-AI lesson · SME plan · capacity · Welligent 2.0',
};
