# @vestara/tools

Tool definitions for agent execution.

Each sub-directory contains tool implementations for a specific domain (filesystem, git, knowledge, memory, project, shell). Tools are registered through the capability system and executed via `@vestara/agent-harness`.

## Structure

```
tools/
  filesystem/  # File read/write/update/delete operations
  git/         # Git operations (status, diff, commit)
  knowledge/   # Knowledge graph queries
  memory/      # Memory operations
  project/     # Project management tools
  shell/       # Shell command execution
```

## Usage

Tools are consumed by the agent harness and are not imported directly. See `@vestara/agent-harness` for the execution pipeline.
