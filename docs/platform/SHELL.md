# Platform Subsystem: Workspace Shell

The Workspace Shell is the unified visual and layout manager of AKIRA OS. It wraps around page routes and provides common layout grids, navigation links, search inputs, and developer utilities.

---

## 1. Core Responsibilities

The Shell subsystem (`src/app/shell/`) is responsible for:
1.  **Visual Consistency**: Injecting the glassmorphic aesthetics, background color flows, and grid overlays.
2.  **Navigation Control**: Providing the sidebar links for switching between features and system components.
3.  **Command Execution**: Hosting the global command palette overlay to dispatch instant actions.
4.  **Application Bootstrapper**: Displaying the initial boot animation sequence (`BootSequence.tsx`) to hide hydration delay.

---

## 2. Layout Modes

To accommodate different visual styles across modules, `Shell.tsx` supports two layout modes configured via the `layoutMode` prop:

### 2.1. Scroll Mode (`layoutMode="scroll"`)
*   *Default behavior*. The page body adapts its height to fit its contents, allowing standard page scrolling.
*   *Usage*: Recommended for document-heavy or variable-length pages like **Notes**, **Timeline logs**, or **Settings dashboards**.

### 2.2. Fit Mode (`layoutMode="fit"`)
*   *Viewport-constrained layout*. Clips the main view container to the viewport height (`h-[calc(100vh-11rem)]`) and disables browser-level scrolling.
*   *Usage*: Used for custom control panels requiring fixed layouts (e.g. **File Vault browser** and **Chat interface**).

```tsx
<Shell layoutMode="fit">
  <div className="flex h-full gap-4">
    {/* Inner scrollable pane */}
    <div className="w-1/3 overflow-y-auto">Sidebar list</div>
    <div className="flex-1 overflow-y-auto">Detail view</div>
  </div>
</Shell>
```

---

## 3. Responsive Behavior

The Shell uses standard breakpoint responsive techniques:
*   **Desktop Viewport (>=1024px)**: Renders the sidebar showing both symbols and labels (`w-[244px]`).
*   **Tablet Viewport (>=768px and <1024px)**: Renders the sidebar showing only symbols (`w-[76px]`) to maximize workspace canvas space.
*   **Mobile Viewport (<768px)**: Hides the sidebar. Navigation transitions to a top drawer header (or custom touch overlays).

---

## 4. Shared Navigation Components

The navigation sidebar (`Sidebar.tsx`) handles route matching using TanStack Router's `useRouterState` to retrieve the current path.
*   **Daily Work Links**: Direct routing to Timeline (`/timeline`), Projects (`/projects`), Tasks (`/tasks`), Notes (`/notes`), Chat (`/chat`), and Sessions (`/sessions`).
*   **Dynamic Tools**: Integrates tools registered with `registry.ts`.
*   **User Profile Card**: Displayed at the bottom of the sidebar, fetching profile names, role values, and mottos from `akira-store`.
