# @vestara/tools-git

Typed Git capabilities for the Agent Harness Tool Runtime. Commands use direct
process arguments and never interpolate model output into a shell.

`git.status`, `git.diff`, and `git.log` are read-only and run automatically.
`git.add` and `git.commit` are high-risk and require explicit approval. Staging
requires explicit safe workspace paths. Push, reset, clean, checkout, rebase,
and force operations are intentionally not exposed.
