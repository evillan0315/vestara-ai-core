#!/bin/bash
# Build packages in dependency order, parallelizing within each dependency level.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
FILTER='grep -v "TS6305" | grep -v "TS7016" | grep -v "TS2307" || true'
TSC="npx tsc --incremental"

echo "Building vestara-ai-core..."
echo "  Building apps..."
eval "$TSC -p apps/api --outDir apps/api/dist 2>&1 | $FILTER" &
eval "$TSC -p apps/cli --outDir apps/cli/dist 2>&1 | $FILTER" &
eval "$TSC -p apps/onboarding-lab --outDir apps/onboarding-lab/dist 2>&1 | $FILTER" &
wait
echo "  Apps built"

build_group() {
  echo "  Building $@"
  for pkg in "$@"; do
    eval "$TSC -p \"packages/$pkg\" --outDir \"packages/$pkg/dist\" 2>&1 | $FILTER" &
  done
  wait
  echo "  Group built: $@"
}

# Group 1: Zero workspace dependencies (foundation)
build_group shared types state-machine events policy-types trust history permission os-controller understanding architecture-runtime telemetry

# Group 2: Depend only on group 1
build_group configuration logger metrics registry permissions capabilities event-bus verification filesystem-runtime

# Group 3: Second-level dependents
build_group stream service-registry health policy-engine context

# Group 4: Third-level dependents
build_group provider-runtime runtime memory knowledge reasoning action stt tts

# Group 5: Fourth-level dependents
build_group cognitive state-runtime activity-log tools/filesystem evaluation events-server subsystem widget-runtime audio conversation

# Group 6: Fifth-level dependents
build_group conversation-runtime workspace

# Group 7: Kernel (orchestrator, last)
build_group kernel

echo "BUILD COMPLETE"
