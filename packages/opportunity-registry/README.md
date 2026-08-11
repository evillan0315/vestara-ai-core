# @vestara/opportunity-registry

Evidence-driven engineering discovery registry.

Agents discover valuable out-of-scope observations during normal workflows.
Instead of acting on them (scope creep) or losing them (forgotten), the registry
records them as evidence-backed opportunities that may later become new
workflows.

> **Observation does not imply authorization.**
> Agents may discover opportunities. Only authorized workflows may implement them.

The registry never modifies repositories, creates commits or pull requests,
executes workflows, reroutes agents, bypasses approvals, or expands workflow
scope. It records engineering opportunities only.

Confidence grows through **independent** observations: repeated statements by
the same agent do not raise confidence. Unsupported opinions (no evidence
references) never become opportunities.
