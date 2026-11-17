# ADR 0024: Shared accessible UI primitives

- Status: Proposed
- Date: 2026-11-17
- Decision owners: Product design and frontend engineering
- Scope: `@volition/ui` shared React package

## Context

The repository identifies WCAG 2.2 AA as the design-system accessibility target, and the 90-day delivery plan includes accessibility work during the core opportunity-workflow phase. The shared `@volition/ui` package currently has no primitives. Independently implemented controls can drift in native semantics, keyboard focus visibility and skip-navigation behavior.

The five Next.js applications use React 19.3.x. Shared primitives must not introduce an additional runtime framework, duplicate application state, or claim that component-level behavior establishes application conformance.

## Decision

Propose a small, unstyled React primitive layer in `@volition/ui`:

- `Button` renders a native button, defaults to `type="button"` to avoid accidental form submission, preserves native attributes and exposes a constrained `data-variant` presentation hook.
- `SkipLink` renders a native anchor, defaults to `#main-content`, and becomes visible on keyboard focus.
- `VisuallyHidden` keeps supporting text in the accessibility tree while visually clipping it.

React is a peer dependency. The package exposes a separate stylesheet entry so consuming applications explicitly import the focus and skip-link styles. Components remain unstyled beyond these behavior-critical affordances; visual tokens and application-specific layout remain with the consuming design system.

## Consequences and boundaries

- Native HTML semantics and browser keyboard behavior remain the default.
- Consumers must provide accessible names, a matching skip-link target, logical landmarks, sufficient contrast, error/status announcements and complete keyboard journeys.
- Applications must import the stylesheet and adopt the primitives deliberately; adding the package does not retrofit existing pages.
- Unit tests verify the component element contract, not rendered browser behavior or assistive-technology output.
- Manual keyboard, zoom, contrast and assistive-technology review remains required. Automated accessibility scans and application-level end-to-end coverage are separate work.
- This ADR and the primitives do not claim WCAG conformance, legal compliance or production readiness.

## Alternatives considered

1. **Keep each application responsible for all primitives.** Rejected as the default because it encourages semantic and focus-style drift across independently deployed apps.
2. **Adopt a full component framework now.** Deferred because the current need is a small shared behavior layer; a broader dependency would increase styling, runtime and migration coupling before user research establishes the required component set.
3. **Build custom ARIA controls.** Rejected where native HTML elements already provide the required semantics and keyboard behavior.

## Validation and rollout

The initial package tests cover native button type/disabled behavior, skip-link target and caller attributes, and visually-hidden content semantics. The package must pass the repository's frozen-lockfile install, formatting, lint, strict TypeScript, test, build and security gates.

Before broad adoption, product design and accessibility reviewers must approve the primitive API and complete manual review on representative public, individual, business and admin journeys. Roll out one application at a time and record any exceptions.
