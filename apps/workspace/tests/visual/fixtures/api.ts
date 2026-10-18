import type { Page, Route } from '@playwright/test';
import type { M11ASnapshot } from '../../../src/lib/m11a-api.js';
import {
  QUALIFICATION_VISUAL_PROFILE_ID,
  qualificationVisualTrial,
  qualificationVisualTrials,
} from './qualification.js';
import type { RouteDefinition } from '../routes/manifest.js';

const ACTIVITY_ROUTE_IDS = new Set(['activity']);
const QUALIFICATION_ROUTE_IDS = new Set(['qualification', 'qualification-detail', 'qualification-activity']);
const ACTIVITY_TIMESTAMP = '2026-09-20T11:30:00.000Z';
const ACTIVITY_CURSOR = {
  sequenceNumber: 1850,
  eventId: 'visual-event-1850',
  timestamp: ACTIVITY_TIMESTAMP,
};

const activityParticipants = [
  {
    participantId: 'assistant',
    type: 'agent',
    displayName: 'Assistant',
    modelDisplayName: 'Nemotron 3.5 Lightning Free',
    role: 'assistant',
    modelId: 'nemotron-3.5-lightning-free',
    providerId: 'openrouter',
    membership: 'active',
    presence: 'online',
    workState: 'idle',
    joinedAt: ACTIVITY_TIMESTAMP,
    lastActivityAt: ACTIVITY_TIMESTAMP,
  },
  {
    participantId: 'tg-principal-8531736505',
    type: 'human',
    displayName: 'tg-principal-8531736505',
    membership: 'active',
    presence: 'online',
    workState: 'idle',
    joinedAt: ACTIVITY_TIMESTAMP,
    lastActivityAt: ACTIVITY_TIMESTAMP,
  },
  {
    participantId: 'eddie',
    type: 'human',
    displayName: 'Eddie Villanueva (Telegram)',
    membership: 'active',
    presence: 'online',
    workState: 'idle',
    joinedAt: ACTIVITY_TIMESTAMP,
    lastActivityAt: ACTIVITY_TIMESTAMP,
  },
  {
    participantId: 'developer',
    type: 'agent',
    displayName: 'Developer',
    modelDisplayName: 'Nemotron 3.5 Lightning Free',
    role: 'developer',
    modelId: 'nemotron-3.5-lightning-free',
    providerId: 'openrouter',
    membership: 'active',
    presence: 'online',
    workState: 'idle',
    joinedAt: ACTIVITY_TIMESTAMP,
    lastActivityAt: ACTIVITY_TIMESTAMP,
  },
  {
    participantId: 'reviewer',
    type: 'agent',
    displayName: 'Reviewer',
    modelDisplayName: 'Muse Spark 1.3 Contributor',
    role: 'reviewer',
    modelId: 'muse-spark-1.3-contributor',
    providerId: 'openrouter',
    membership: 'active',
    presence: 'online',
    workState: 'idle',
    joinedAt: ACTIVITY_TIMESTAMP,
    lastActivityAt: ACTIVITY_TIMESTAMP,
  },
  ...Array.from({ length: 10 }, (_, index) => ({
    participantId: `sim-user-${index + 1}`,
    type: 'human',
    displayName: `Simulated User ${index + 1}`,
    membership: 'active',
    presence: 'away',
    workState: 'idle',
    joinedAt: ACTIVITY_TIMESTAMP,
    lastActivityAt: ACTIVITY_TIMESTAMP,
  })),
];

const activityKinds = ['activity', 'conversation', 'log', 'activity', 'conversation'] as const;
const activityContent = [
  'Completed',
  'Show me what is next on the recommended milestone?',
  'Started work (deepseek-v4-flash-free)',
  'Completed',
  'GitHub reran Visual Regression after baseline update',
];

const activityStream = Array.from({ length: 10 }, (_, index) => {
  const sequenceNumber = 1801 + index;
  const participant = activityParticipants[index % activityParticipants.length];
  const kind = activityKinds[index % activityKinds.length];
  return {
    streamItemId: `visual-stream-${sequenceNumber}`,
    activityId: `visual-activity-${sequenceNumber}`,
    sequenceNumber,
    kind,
    importance: index % 7 === 0 ? 'primary' : 'secondary',
    actor: {
      type: participant.type,
      id: participant.participantId,
      displayName: participant.displayName,
      role: participant.role,
    },
    content: activityContent[index % activityContent.length],
    timestamp: `2026-09-20T${String(4 + Math.floor(index / 6)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00.000Z`,
    workflowRunId: index % 4 === 0 ? 'visual-workflow-1' : undefined,
    executionId: index % 4 === 0 ? 'visual-execution-1' : undefined,
    taskId: index % 4 === 0 ? `visual-task-${index}` : undefined,
    originConversationId: kind === 'conversation' ? `visual-conversation-${index}` : undefined,
    originSurface: kind === 'conversation' ? 'activity-room' : undefined,
  };
});

const activitySnapshot: M11ASnapshot = {
  room: {
    roomId: 'visual-activity-room',
    name: 'Activity Room',
    cursor: ACTIVITY_CURSOR,
    rebuiltAt: ACTIVITY_TIMESTAMP,
  },
  participants: activityParticipants,
  stream: activityStream,
  workflowSummary: null,
  attention: [],
  contextualCapabilities: {
    mentionableParticipants: activityParticipants.map((participant) => ({
      participantId: participant.participantId,
      displayName: participant.displayName,
      type: participant.type,
    })),
    availableCommands: [
      { command: '/broadcast', description: 'Broadcast a message to the activity room' },
      { command: '/snapshot', description: 'Capture a workspace snapshot' },
    ],
    referenceableEntities: [
      { entityId: 'visual-workflow-1', entityType: 'workflow', displayName: 'Visual regression workflow' },
    ],
  },
  cursor: ACTIVITY_CURSOR,
};

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Session fixture — every authenticated route needs it. The harness seeds a
 * fixture bearer token via role storage states (see auth/roles.ts), so the
 * app's AuthProvider fetches /api/auth/me on boot; without this mock the
 * request fails (no API in CI) and ProtectedPage redirects to /login.
 * Username matches the long-standing baselines (eddie / Administrator).
 */
async function installAuthFixture(page: Page): Promise<void> {
  await page.route('**/api/auth/me', (route) =>
    json(route, 200, { currentUser: { id: 'visual-admin', username: 'eddie', role: 'admin' } }),
  );
}

async function installActivityFixtures(page: Page): Promise<void> {
  await page.addInitScript((cursor) => {
    const NativeWebSocket = window.WebSocket;

    class ActivityRoomVisualWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readonly protocol = '';
      readonly extensions = '';
      binaryType: BinaryType = 'blob';
      readyState = ActivityRoomVisualWebSocket.CONNECTING;
      bufferedAmount = 0;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string | URL, protocols?: string | string[]) {
        super();
        this.url = String(url);
        if (!this.url.includes('/ws/activity-room/v1')) {
          return new NativeWebSocket(url, protocols) as unknown as ActivityRoomVisualWebSocket;
        }

        window.setTimeout(() => {
          this.readyState = ActivityRoomVisualWebSocket.OPEN;
          const event = new Event('open');
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (this.readyState !== ActivityRoomVisualWebSocket.OPEN || typeof data !== 'string') return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== 'object' || (parsed as { op?: unknown }).op !== 'subscribe') return;

        window.setTimeout(() => {
          this.emitMessage({ op: 'subscribed', cursor, frontier: cursor.sequenceNumber });
          this.emitMessage({ op: 'catchup-complete', cursor });
        }, 10);
      }

      close(code?: number, reason?: string): void {
        this.readyState = ActivityRoomVisualWebSocket.CLOSED;
        const event = new CloseEvent('close', { code, reason, wasClean: true });
        this.dispatchEvent(event);
        this.onclose?.(event);
      }

      private emitMessage(payload: unknown): void {
        const event = new MessageEvent('message', { data: JSON.stringify(payload) });
        this.dispatchEvent(event);
        this.onmessage?.(event);
      }
    }

    window.WebSocket = ActivityRoomVisualWebSocket as unknown as typeof WebSocket;
  }, ACTIVITY_CURSOR);

  await page.route('**/api/activity-room/v1/snapshot', (route) => json(route, 200, activitySnapshot));
  await page.route('**/api/activity-room/v1/activities**', (route) => {
    const url = new URL(route.request().url());
    const afterSequence = Number(url.searchParams.get('afterSequence') ?? 0);
    const beforeSequence = Number(url.searchParams.get('beforeSequence') ?? 0);
    const records = activityStream
      .filter((item) => (afterSequence > 0 ? item.sequenceNumber > afterSequence : true))
      .filter((item) => (beforeSequence > 0 ? item.sequenceNumber < beforeSequence : true))
      .map((item) => ({
        activityId: item.activityId,
        eventId: item.activityId,
        sequenceNumber: item.sequenceNumber,
        type: item.kind,
        timestamp: item.timestamp,
        executionId: item.executionId,
        workflowRunId: item.workflowRunId,
        taskId: item.taskId,
        actor: item.actor,
        actorId: item.actor.id,
        source: 'visual-fixture',
        payload: { message: item.content },
        visibility: 'room',
      }));
    return json(route, 200, { records, count: records.length, limit: 100, nextCursor: null });
  });
  await page.route('**/api/activity-room/v1/participants', (route) => json(route, 200, activityParticipants));
  await page.route('**/api/activity-room/v1/attention', (route) => json(route, 200, []));
  await page.route('**/api/activity-room/v1/workflow-summary', (route) => json(route, 200, null));
  await page.route('**/api/opencode/session/status', (route) =>
    json(route, 200, {
      status: {
        'visual-session-active': { type: 'running' },
        'visual-session-idle': { type: 'completed' },
      },
    }),
  );
}

async function installQualificationFixtures(page: Page): Promise<void> {
  await page.route('**/api/qualification/trials', (route) => json(route, 200, qualificationVisualTrials));
  await page.route('**/api/qualification/trials/*', (route) => {
    const url = new URL(route.request().url());
    const profileId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    if (profileId === QUALIFICATION_VISUAL_PROFILE_ID) {
      return json(route, 200, { trial: qualificationVisualTrial });
    }
    return json(route, 404, { error: `no qualification visual fixture for ${profileId}` });
  });
}

/**
 * Deterministic chrome fixtures.
 *
 * The screenshot harness boots only `vite dev` (playwright.config.ts webServer)
 * — there is no API. The route-specific fixtures below cover what each screenshot
 * route reads, but the surrounding chrome (settings, workspace, agents, files,
 * health, conversations, catalog, diagnostics) was left to the network and failed
 * with ECONNREFUSED. What got captured therefore depended on whether something
 * happened to be listening on :3001 — which is how the committed baselines came
 * to encode one developer's populated backend while CI rendered a bare one.
 *
 * Two endpoints need a real payload rather than the neutral `{}`:
 *
 *  - `/api/settings` is read by the theme provider on mount
 *    (src/lib/theme.tsx:436). `resolveHydratedTheme` iterates `resolved.settings`,
 *    so `{}` throws a TypeError that the surrounding catch swallows — the seeded
 *    theme survives, but only by accident. `{ settings: [] }` declines to
 *    override it deliberately. This is the defect behind 146/172 committed
 *    dark/light baseline pairs being byte-identical: those baselines were
 *    captured against a live API whose saved mode was `dark`, which overrode the
 *    harness's seeded `light`, so every "light" baseline was a dark render.
 *  - `/api/health` is consumed without a fixture fallback
 *    (src/pages/Dashboard/useDashboardData.ts:91), so `{}` renders zeros.
 *
 * Everything else deliberately falls through to the neutral `{}` so the app's own
 * designed offline fixtures render — they exist precisely "so the premium layout
 * never renders hollow in dev / visual regression"
 * (src/features/overview/overview.fixtures.ts:1-7).
 */
async function installChromeFixtures(page: Page): Promise<void> {
  await page.route('**/api/settings', (route) => json(route, 200, { settings: [] }));
  await page.route('**/api/health', (route) => json(route, 200, { status: 'ok', reachable: true }));
}

/**
 * Deterministic catch-all for `/api/**`.
 *
 * Registered before every other fixture. Playwright matches routes in reverse
 * registration order, so later handlers take precedence — verified in a
 * standalone probe rather than assumed, since getting this backwards would
 * quietly shadow every real fixture.
 *
 * Anything reaching this handler is un-fixtured, so the render no longer depends
 * on the environment and the coverage gap stays visible instead of being
 * silently absorbed into a baseline.
 */
async function installApiCatchAll(page: Page, route: RouteDefinition): Promise<void> {
  const unmatched = new Set<string>();

  await page.route('**/api/**', async (webRoute) => {
    const request = webRoute.request();
    unmatched.add(`${request.method()} ${new URL(request.url()).pathname}`);
    await json(webRoute, 200, {});
  });

  page.on('close', () => {
    if (unmatched.size === 0) return;
    console.log(
      `[visual-fixtures] ${route.id}: ${unmatched.size} un-fixtured endpoint(s) answered with {}: ${[...unmatched].sort().join(', ')}`,
    );
  });
}

export async function installVisualApiFixtures(page: Page, route: RouteDefinition): Promise<void> {
  await installApiCatchAll(page, route);
  await installChromeFixtures(page);
  await installAuthFixture(page);

  if (ACTIVITY_ROUTE_IDS.has(route.id)) {
    await installActivityFixtures(page);
  }

  if (QUALIFICATION_ROUTE_IDS.has(route.id)) {
    await installQualificationFixtures(page);
  }
}
