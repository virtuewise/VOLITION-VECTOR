# @volition/ui

Small, unstyled React primitives for shared accessibility behavior.

## Current primitives

- `Button`: native button semantics, an explicit `type` (defaults to `button`), a constrained presentation variant, and a visible keyboard focus indicator.
- `SkipLink`: a keyboard-visible skip link. Its default target is `#main-content`.
- `VisuallyHidden`: visually hides supporting text while leaving it available to assistive technology.

## Installation and setup

This workspace package declares React 19 as a peer dependency. Import the stylesheet once from the consuming application's root layout:

```ts
import "@volition/ui/styles.css";
```

Place `SkipLink` before the primary page content and ensure the page contains a matching target, normally:

```tsx
<main id="main-content">...</main>
```

The components preserve native HTML attributes and do not provide application-specific colors, spacing, focus management, dialogs, menus or form validation. Consumers remain responsible for accessible names, correct landmark structure, contrast, keyboard journey testing and application-level behavior.

These primitives are not yet adopted across the five web applications. Automated unit tests cover the rendered element contracts; manual keyboard and assistive-technology review remains required. This package does not claim WCAG conformance by itself.
