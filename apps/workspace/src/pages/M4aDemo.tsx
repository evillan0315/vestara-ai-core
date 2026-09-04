/**
 * GA-UX-PREMIUM M4A — CONTRACT-FIXTURE VISUAL ACCEPTANCE (dev harness).
 *
 * Deterministic presentation fixtures built from the authoritative
 * `assistant.execution.v1` contract. This is NOT live runtime evidence —
 * it exercises AssistantCodeEdit against bounded fixture details while live
 * OpenCode diff evidence is unavailable (M4B deferred). The label is
 * intentional and permanent.
 *
 * NOTE: fixtures are typed contract objects constructed inline (type-only
 * import). The browser never imports a runtime value from a linked CJS
 * workspace package (Vite /@fs interop constraint) — the API normalizes the
 * real contract server-side.
 */

import type { EditExecutionDetail } from '@vestara/shared';
import { AssistantCodeEdit } from '../components/assistant/AssistantCodeEdit';

const BASE = {
  contract: 'assistant.execution.v1' as const,
  version: 1 as const,
  source: 'opencode' as const,
  state: 'completed' as const,
  diffProvenance: 'runtime-provided' as const,
  beforeAfterProvenance: 'unavailable' as const,
  timestamp: 1_700_000_000_000,
};

function fixture(overrides: Partial<EditExecutionDetail> & { file: string }): EditExecutionDetail {
  return {
    ...BASE,
    kind: 'edit',
    operationId: `fixture-${overrides.file}`,
    operation: 'modified',
    additions: 5,
    deletions: 4,
    ...overrides,
  } as EditExecutionDetail;
}

const SMALL_PATCH = [
  '@@ -498,4 +498,5 @@',
  ' const title = useMemo(...)',
  ' const history = ...',
  '-return conversation.title',
  '+return conversation.title ?? fallback',
  '+return history.title',
  ' }',
].join('\n');

const LARGE_PATCH = Array.from(
  { length: 30 },
  (_, i) => `${i % 2 === 0 ? '+' : '-'}  const scope${i} = selectors.resolve(ctx, ${i});`,
).join('\n');

function Case({ label, children, narrow }: { label: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] text-zinc-500">{label}</div>
      <div className={narrow ? 'w-[320px]' : 'w-full max-w-[560px]'}>{children}</div>
    </div>
  );
}

export default function M4aDemo() {
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-zinc-950 p-6 text-zinc-200">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px] leading-relaxed text-amber-200/90">
        <span className="font-semibold">CONTRACT-FIXTURE VISUAL ACCEPTANCE</span> — deterministic
        `assistant.execution.v1` fixtures (GA-UX-PREMIUM M4A). Not live runtime evidence; live OpenCode
        diff acceptance is deferred to M4B.
      </div>

      <Case label="small patch (default expanded)">
        <AssistantCodeEdit detail={fixture({ file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx', patch: SMALL_PATCH, diffRepresentation: 'patch' })} />
      </Case>

      <Case label="large patch (default collapsed)">
        <AssistantCodeEdit
          detail={fixture({
            file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx',
            patch: LARGE_PATCH,
            additions: 30,
            deletions: 30,
            diffRepresentation: 'patch',
          })}
        />
      </Case>

      <Case label="added file">
        <AssistantCodeEdit
          detail={fixture({
            file: 'packages/feature/src/index.ts',
            operation: 'added',
            additions: 12,
            deletions: 0,
            patch: Array.from({ length: 6 }, (_, i) => `+export const fn${i} = () => {};`).join('\n'),
            diffRepresentation: 'patch',
          })}
        />
      </Case>

      <Case label="deleted file">
        <AssistantCodeEdit
          detail={fixture({
            file: 'packages/legacy/src/gone.ts',
            operation: 'deleted',
            additions: 0,
            deletions: 8,
            patch: Array.from({ length: 4 }, (_, i) => `-console.log('legacy ${i}');`).join('\n'),
            diffRepresentation: 'patch',
          })}
        />
      </Case>

      <Case label="truncated patch (Diff preview truncated)">
        <AssistantCodeEdit
          detail={fixture({ file: 'packages/a.ts', patch: 'p'.repeat(21_000), patchTruncated: true, diffRepresentation: 'patch' })}
        />
      </Case>

      <Case label="unavailable diff (completed edit)">
        <AssistantCodeEdit detail={fixture({ file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx', diffRepresentation: 'unavailable' })} />
      </Case>

      <Case label="structured hunks (M3.1 representation)">
        <AssistantCodeEdit
          detail={fixture({
            file: 'packages/hooks/src/useThing.ts',
            hunks: [
              { oldStart: 10, oldLines: 4, newStart: 10, newLines: 5, content: ' ctx\n-remove\n+add' },
              { oldStart: 40, content: ' tail' },
            ],
            diffRepresentation: 'hunks',
          })}
        />
      </Case>

      <Case label="narrow containment (320px — internal scroll)" narrow>
        <AssistantCodeEdit
          detail={fixture({
            file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx',
            patch: `${SMALL_PATCH}\n+const aVeryLongIdentifierThatWouldForceThePanelHorizontallyIfNotContainedInternally = extremelyLongFunctionCall(scope, selector, resolver, context, runtime, workspace, session, options);`,
            diffRepresentation: 'patch',
          })}
        />
      </Case>

      <Case label="expanded width (wide surface)">
        <div className="w-full">
          <AssistantCodeEdit detail={fixture({ file: 'apps/workspace/src/components/assistant/ConversationPanel.tsx', patch: SMALL_PATCH, diffRepresentation: 'patch' })} />
        </div>
      </Case>
    </div>
  );
}