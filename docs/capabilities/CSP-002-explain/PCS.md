---
title: Product Capability Specification
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Product Capability Specification

## Problem

A developer understands what exists in a repository but cannot efficiently ask *why* it is structured a certain way.

## Goal

Enable contextual, accurate explanations grounded in the existing RepositoryWorkspace without rediscovering or reindexing the repository.

## Inputs

- `<target>` — what to explain: `architecture`, a module path, a package name

Always issued within an active workspace session created by `vestara open .`

## Outputs

- Formatted explanation (terminal display)
- Memory enrichment (explanation stored for future reference)

## Three-Tier Design

| Tier | Method | Always works? |
|------|--------|---------------|
| Deterministic | RepositoryProfile lookup (packages, entry points, risks) | Yes |
| Knowledge-augmented | FTS search in indexed documents | Yes |
| AI-synthesized | Provider call with target data + workspace context | No |
