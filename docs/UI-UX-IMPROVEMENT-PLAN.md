
- [ ] **B2.** Harden `EmptyState` with optional icon, action slot, and a
      compact variant (inline, for tables/panels); standardize copy per route
      via the route x state matrix from the audit.
- [ ] **B3.** Adopt shared `StatusPill` everywhere: render through
      `toneForStatus`/`presentationFor` from the design-system; remove
      hardcoded status colors across pages (Dashboard, OpsCenter, Workforce,
      Logs, Notifications, graph/diagnostics).
- [ ] **B4.** Consolidate error handling: one `ErrorBoundary` + the toast
      queue policy (ATS-010 #9–13); ensure every route has a retry path.
- [ ] **B5.** Theme settings as a view-model: map `ThemeSettings` to
      design-system tokens (density, radius, motion) and remove unused knobs
      from the Settings page.

## 8. Workstream C — Graph page polish

**Goal:** production-grade explore/filter/inspect experience (active branch focus).

- [ ] **C1.** Audit `GraphContext` data flow: define loading/error/empty
      states; ensure all data comes from the API/WS contracts (principle 1);
      add `EmptyState` when the graph has no nodes.
- [ ] **C2.** Search: debounced query, result list with keyboard navigation
      (up/down/enter/esc), clear button, and "no matches" state; highlight
      matches and focus-selected node.
- [ ] **C3.** Zoom/pan: add zoom controls, fit-to-view, reset, pinch-zoom on
      touch, and pan via drag; disable transform animations under
      `prefers-reduced-motion`.
- [ ] **C4.** Node density & filtering: filter by node type/status; legend
      showing entity colors via `presentationFor`; collapse/expand connected
      clusters.
- [ ] **C5.** Inspector + RelationshipExplorer consistency: shared loading
      skeletons, empty/error states, sticky headers, and responsive widths.
- [ ] **C6.** Mobile layout: single-column graph, bottom-sheet inspector,
      minimum 44px touch targets, no horizontal page scroll.

## 9. Workstream D — Diagnostics page polish

**Goal:** coherent, live, readable diagnostics across all nine tabs.

- [ ] **D1.** Centralize tab bar: consistent count/status badges per tab,
      loading and error states inside each tab panel, keyboard arrow-nav
      between tabs.
- [ ] **D2.** Unified refresh: one auto-refresh interval control (global),
      pause on background/hidden tab, per-panel last-updated stamp, manual
      refresh with loading indicator.
- [ ] **D3.** Log Viewer: live-follow mode with pause-on-scroll, filter
      input, line wrapping toggle, level color chips via status tones.
- [ ] **D4.** Tables: responsive overflow (scroll within panel, sticky
      header), alignment, and empty states for all tab tables.
- [ ] **D5.** Process/Agent monitors: status pills via shared `StatusPill`,
      health threshold coloring, and error/offline empty states.

## 10. Workstream E — Accessibility & quality gates

**Goal:** a11y is a CI gate, not a feature (principle 4).

- [ ] **E1.** Add automated aXe assertions to the Playwright suite for key
      routes in dark + light; fail CI on serious/critical violations.
- [ ] **E2.** Keyboard: enforce modal focus trap + esc-to-close, visible
      focus everywhere, sane tab order, and a shortcut-collision audit
      against the `?` shortcuts modal.
- [ ] **E3.** Reduced motion: honor `prefers-reduced-motion` in CSS
      transitions, gestures, and graph animations.
- [ ] **E4.** Fix contrast failures for status tones (e.g., amber on dark) to
      WCAG AA; verified by the A5 token audit test.
- [ ] **E5.** Expand visual regression matrix: routes x themes (light/dark) x
      viewports (mobile/tablet/desktop); document the baseline-diff workflow
      and wire into CI end-to-end.
- [ ] **E6.** UX telemetry: page load / first-paint, error-boundary events,
      surface usage counts, and refresh/retry frequency — riding existing
      `/api/health` + WS events and local storage (no new backend).

## 11. Workstream F — Rollout, measurement & cadence

**Goal:** shipped, measured, and sustainable.

- [ ] **F1.** Phasing:
      - **W0** — audit + baseline (Section 5)
      - **W1–W2** — Workstream A (tokens/theme) + B (shared plumbing)
      - **W3–W5** — Workstream C (Graph) + D (Diagnostics), branch focus
      - **W6** — Workstream E (a11y gates, visual matrix, telemetry)
      - **W7** — sign-off, regression sweep, release notes
- [ ] **F2.** Definition of done: every change composes design-system tokens;
      all routes pass aXe; visual baselines green on the full matrix; no new
      hardcoded colors (A5 test enforces).
- [ ] **F3.** Metrics: aXe pass rate, contrast AA pass %, visual-regression
      coverage %, token-drift = 0 (A5), p75 page load budget per route, and
      error-boundary rate per deploy.
- [ ] **F4.** Review cadence: heuristic UI review weekly during the active
      branch, monthly afterward; checklist tied to UX-010 principles;
      findings filed as `UI-UX-*` issues.

## 12. Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| W0 audit | 2–3 days | Findings, state matrix, baselines |
| A + B foundations | 1–2 wks | Token package, shared components, theme parity |
| C Graph polish | 1–1.5 wks | Search, zoom/pan, filtering, mobile |
| D Diagnostics polish | 1–1.5 wks | Unified tabs, refresh, live logs, tables |
| E quality gates | 3–4 days | aXe gate, matrix, telemetry |
| F sign-off | 2–3 days | Regression sweep, release notes |

## 13. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Token refactor breaks existing screens | Land A/B incrementally behind the existing CSS vars; rely on visual baselines to catch drift |
| Graph perf with large node sets | Filtering + density controls (C4); virtualized lists; measure with UX telemetry |
| Auto-refresh storms | Single interval control, pause on hidden tab (D2) |
| a11y gate blocks unrelated work | Run aXe on key routes only; allow-list with tickets, never silent |
| Scope creep (notification center, new pages) | Kept out of scope; tracked separately |

## 14. Open questions

- [ ] Confirm CI wiring for the screenshot baseline-diff workflow
      (documented in `screenshots:update`/`screenshots:check`, CI integration TBD).
- [ ] Confirm expected `prefers-reduced-motion` behavior for the graph
      (disable pan/zoom animations entirely vs. reduce only).
- [ ] Confirm whether light theme is a supported release requirement for the
      active branch or a follow-up.
- [ ] Decide owners for the weekly heuristic review during the active branch.

## 15. Sign-off

- [ ] Plan reviewed against UX-010 + ATS-010 acceptance criteria
- [ ] Audit findings filed as `UI-UX-*` issues (Week 0)
- [ ] Token-drift test (A5) green
- [ ] aXe gate (E1) green in CI
- [ ] Visual regression matrix (E5) green
- [ ] Final regression sweep + release notes (F2/F3)
