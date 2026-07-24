# Platform Subsystem: TanStack Router Routing

AKIRA OS uses TanStack Router for file-based routing. This document explains the routing layout hierarchy, page controllers, dynamic parameter mappings, and transition flows.

---

## 1. Route Layout Hierarchy

Routes are structured inside `src/routes/` and compiled into `src/routeTree.gen.ts` at build-time. The hierarchy is organized as follows:

```
                  ┌────────────────────────┐
                  │      __root.tsx        │  (Hydrates store, boots engines, global query clients)
                  └───────────┬────────────┘
                              ▼
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   index.tsx   │     │  projects.tsx │     │   notes.tsx   │  (Feature page route controllers)
│   (Home "/")  │     │   ("/projects")│     │   ("/notes")  │
└───────────────┘     └───────┬───────┘     └───────────────┘
                              ▼
                      ┌───────────────┐
                      │projects.$id.tsx│  (Dynamic parameter sub-route)
                      │("/projects/1")│
                      └───────────────┘
```

### 1.1. Root Boundary (`__root.tsx`)
The root layout is the shell boostrapper. It renders no visual layout container directly, but rather encapsulates the query providers and conditionally mounts the child route outlet (`<Outlet />`) once state hydration is complete:
*   Initializes the database state migration coordinator.
*   Triggers startup/shutdown methods for presence trackers, reflection loops, and AI companion status.
*   Enforces global HTML header elements (character sets, responsive viewport settings, theme classes, and custom Google Fonts).

---

## 2. Navigation Flow & Page Transition

1.  **Trigger**: User clicks a link or uses the Command Palette.
2.  **Navigation Call**: Executed using TanStack Router's `<Link>` component or `navigate()` hook.
3.  **State Invalidation**: Pre-fetches route details if defined, and changes page paths.
4.  **Entrance Animation**: The active main element renders inside `Shell.tsx` and executes a CSS keyframe animation (`animate-page-enter`), performing a fade-in-slide transition.

---

## 3. Dynamic Route Parameters

Dynamic page mappings (e.g. Project Details: `/projects/$id`) retrieve parameters using the `useParams` hook:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$id")({
  component: ProjectDetailsPage,
});

function ProjectDetailsPage() {
  const { id } = Route.useParams();
  // Fetch project using parameters...
}
```

---

## 4. Redirects & Route Fallbacks

*   **Fallback Routes (404)**: Configured in `__root.tsx` via the `notFoundComponent` option. If a path fails to match any compiled route mapping, it renders a custom `NotFoundComponent` page with recovery paths.
*   **Redirect Definitions**: Handled before layout rendering using TanStack Router's `beforeLoad` redirects:
    ```typescript
    export const Route = createFileRoute("/old-route")({
      beforeLoad: ({ redirect }) => {
        throw redirect({ to: "/new-route" });
      },
    });
    ```
