# Architecture Decision Record: ADR-001 Workspace Canvas Shell

## Status
Accepted

## Context
AKIRA OS requires a unified, modern user interface. Navigation should stay consistent when moving between core tools (like the Vault, Tasks, and Settings) to create a premium, desktop-first app experience.

## Problem
Allowing individual pages to handle their own navigation layouts leads to inconsistent page boundaries, styling patterns, and duplicated layout code across components.

## Decision
Create a global parent canvas shell (`Shell.tsx`) inside the framework layer (`src/app/shell/`). Individual routes mount as nested children inside the shell's `<main>` layout container. The Shell manages the sidebar navigation, top bar header, background glow elements, responsive behaviors, and command palettes centrally.

## Alternatives Considered
*   **Decentralized Layouts**: Allowing each page route to import its own sidebar and top bar. This was rejected because it causes layout shifts and visual changes during transitions.
*   **Layout Route Wrapper**: Placing the layout directly in TanStack Router's `__root.tsx`. This was rejected because some pages (such as full-screen boot animations or error boundaries) need to bypass the sidebar layout.

## Trade-offs
*   *Pros*: Consistent UI, clean route structures, and unified sizing behaviors.
*   *Cons*: Individual pages must fit within the grid styles dictated by the shell wrapper.

## Consequences
All page components under `src/routes/` are wrapped with `<Shell>` layout tags. Page-specific changes are limited to the main content container.

## Future Implications
Future platform tools (e.g. Analytics, GENESIS configuration portals) will automatically inherit the global theme styles, background glows, and sidebar integration when mounted inside the Shell.
