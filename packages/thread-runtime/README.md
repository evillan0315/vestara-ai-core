# @vestara/thread-runtime

Durable, append-only task thread history for the Agent Harness Foundation.

The SQLite store owns threads, turns, ordered items, terminal outcomes, replay,
and restart-safe persistence. Compacted context and durable engineering memory
are derived consumers and are not stored as authoritative history here.
