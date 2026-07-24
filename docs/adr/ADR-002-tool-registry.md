# Architecture Decision Record: ADR-002 Dynamic Tool Registry

## Status
Accepted

## Context
AKIRA OS contains many modules in different stages of readiness (e.g. *File Vault* is ready, *Diagnostics* is experimental, *TITAN* and *FORGE* are planned). The system needs to manage these modules dynamically.

## Problem
Hardcoding navigation links directly in `Sidebar.tsx` makes it difficult to manage visibility rules, launch status updates, and developer-mode-only overrides.

## Decision
Implement a centralized `toolsRegistry` in `src/akira-os/tools/registry.ts`. All tools register a schema mapping their paths, categories, ready states, and visibility restrictions. The sidebar queries this registry to build navigation links dynamically.

## Alternatives Considered
*   **Static Sidebar Hardcoding**: Coding all navigation links inside `Sidebar.tsx`. This was rejected because it scatters feature flags and visibility rules across layout files.
*   **Route-Based Scanning**: Inspecting the TanStack route tree dynamically to generate sidebar links. This was rejected because route paths do not contain categories or developer-mode flags.

## Trade-offs
*   *Pros*: Separates configuration from UI presentation, and simplifies adding new modules.
*   *Cons*: Developers must register new modules in both the routing tree and the tool registry.

## Consequences
Enabled tools display instantly in the sidebar. Experimental tools are hidden unless Developer Mode is activated in the user profile.

## Future Implications
New tools (such as Analytics or TITAN) can be added to the codebase as disabled or coming-soon placeholders, allowing iterative development before releasing them to the user.
