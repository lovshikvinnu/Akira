# Architecture Decision Record: ADR-005 Container Layout

## Status
Accepted

## Context
AKIRA OS contains different types of tools. Some pages (e.g. *Notes* or *Settings*) behave like standard scrollable websites, while others (e.g. *File Vault* or *Chat*) require dashboard-style app layouts where sections stay fixed to the viewport height.

## Problem
Using a single global layout mode forces all tools into the same scrolling behavior. For example, forcing the File Vault browser to use vertical page scrolling makes file navigation panels jumpy and hard to use.

## Decision
Support two distinct layout modes in the global `Shell` component via the `layoutMode` prop:
1.  **Scroll Mode (`layoutMode="scroll"`)**: The container height adjusts to its contents, and the main browser window handles scrolling.
2.  **Fit Mode (`layoutMode="fit"`)**: Clips the main view container to the viewport height (`h-[calc(100vh-11rem)]`) and disables browser-level scrolling, allowing individual child components to manage their own scroll states.

## Alternatives Considered
*   **CSS-Only Layouts**: Letting each page handle its container heights manually. This was rejected because it leads to styling issues and layout bugs across different browsers.
*   **Multiple Layout Shells**: Creating separate `ScrollShell` and `FitShell` components. This was rejected because it duplicates common layout components like the sidebar and top bar.

## Trade-offs
*   *Pros*: Gives developers flexibility in designing layouts while keeping the sidebar and top bar consistent.
*   *Cons*: Developers must ensure child elements use the correct flex styles when using `fit` layout mode.

## Consequences
Scrollable dashboards use the default `scroll` mode. Interactive, pane-based workspaces (e.g., Vault browser) must specify `layoutMode="fit"`.

## Future Implications
New dashboards or split-pane interfaces can use `fit` mode to keep navigation and detail views locked in place.
