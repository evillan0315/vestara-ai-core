# @vestara/worktree-runtime

Durable Git worktree leases for isolated parallel-agent execution. Each lease
binds one task and agent to a branch, base revision, and worktree. Repository-
relative file claims prevent active leases from silently owning the same file.

Release is refused while a worktree is dirty or conflicted unless the caller
explicitly requests force. Startup recovery marks missing worktrees orphaned
and detects unresolved Git conflicts. Events are emitted through an injected
callback so orchestration and presentation remain outside this runtime.
