# Product Capability Specification

## Problem

A developer opening an unfamiliar repository has no structured understanding of its architecture, dependencies, risks, or entry points.

## Goal

Transform an unfamiliar repository into an understandable, queryable workspace within seconds.

## Inputs

- Repository path (local filesystem)

## Outputs

- RepositoryWorkspace (canonical domain object)
- WorkspaceSession (active context with engines)
- `.vestara/` directory (on-disk cache)

## Pipeline

```
Discover → Fingerprint → Analyze → Manifest → Index → Present → Session
```
