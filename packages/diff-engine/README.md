# @vestara/diff-engine

Renderer-independent unified-diff parsing, task file changes, structured hunks,
line attribution, and inverse-hunk generation. The engine never invokes a
destructive Git restore. Callers must reconcile inverse patches against task
baselines before applying them.
