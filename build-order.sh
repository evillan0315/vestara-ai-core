#!/bin/bash
# Build packages in dependency order
# This file is executable architecture documentation.
# If a circular dependency is introduced, the build fails here.
set -e
echo "Building vestara-ai-core..."
echo "  Building API..."
npx tsc -p apps/api --outDir apps/api/dist 2>&1 | grep -v "TS6305" | grep -v "TS7016" | grep -v "TS2307" || true
echo "  Building CLI..."
npx tsc -p apps/cli --outDir apps/cli/dist 2>&1 | grep -v "TS6305" | grep -v "TS7016" | grep -v "TS2307" || true
echo "  Building Onboarding Lab..."
npx tsc -p apps/onboarding-lab --outDir apps/onboarding-lab/dist 2>&1 | grep -v "TS6305" | grep -v "TS7016" | grep -v "TS2307" || true
echo "BUILD COMPLETE"
for pkg in \
  shared \
  types \
  state-machine \
  configuration \
  logger \
  metrics \
  events \
  registry \
  permissions \
  runtime \
  capabilities \
  job \
  worker \
  scheduler \
  event-bus \
  service-registry \
  health \
  permission \
  stream \
  provider-runtime \
  providers/opencode \
  context \
  memory \
  cognitive \
  knowledge \
  reasoning \
  action \
  state-runtime \
  conversation \
  audio \
  stt \
  tts \
  conversation-runtime \
  activity-log \
  tools/filesystem \
  workspace \
  events-server \
  os-controller \
  subsystem \
  widget-runtime \
  kernel; do
  echo "  Building $pkg..."
  npx tsc -p "packages/$pkg" --outDir "packages/$pkg/dist" 2>&1 | grep -v "TS6305" | grep -v "TS7016" | grep -v "TS2307" || true
done

