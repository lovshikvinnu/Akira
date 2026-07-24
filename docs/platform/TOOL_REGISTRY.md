# Platform Subsystem: Tool Registry

The Tool Registry is the central manager for registering features and tools inside AKIRA OS. It acts as the registry for routes, sidebar layout items, and developer overrides.

---

## 1. Tool Interface Schema

All features must register their configurations using the `Tool` interface:

```typescript
// Location: src/akira-os/tools/registry.ts
export interface Tool {
  id: string;                                                         // Unique tool identifier
  name: string;                                                       // Display label printed in UI
  description: string;                                                // Detailed description text
  icon: React.ComponentType<any> | React.ReactNode;                  // Lucide icon
  route: string;                                                      // Target route path
  category: "Productivity" | "Knowledge" | "Automation" | "System" | "Developer";
  status: "ready" | "coming-soon" | "experimental";                   // Status flag
  enabled: boolean;                                                   // Enable flag
  requiresDevMode?: boolean;                                          // Developer mode restriction
  order: number;                                                      // Display order
}
```

---

## 2. Tool Categories

Tools are grouped into five semantic categories:
1.  **Productivity**: Core tools for day-to-day focus (e.g. *File Vault* and *Analytics*).
2.  **Knowledge**: Memory management features (e.g. *GENESIS*).
3.  **Automation**: Background runners and task queues (e.g. *TITAN* and *FORGE*).
4.  **System**: Maintenance, diagnostics, and backups (e.g. *Diagnostics* and *Migration Hub*).
5.  **Developer**: Internal debug panels (e.g. *Developer Tools*).

---

## 3. Sidebar Rendering & Route Control

*   **Visibility Filtering**: The sidebar filters visible tools based on the system state:
    ```typescript
    export function getVisibleTools(isDevModeEnabled: boolean): Tool[] {
      return getTools().filter((t) => {
        if (t.requiresDevMode && !isDevModeEnabled) {
          return false;
        }
        return true;
      });
    }
    ```
*   **Active Route Indication**: Renders standard gradients and glow indicators if the current path matches the tool's registered route.

---

## 4. Registering a New Tool

To register a new tool (e.g. `Analytics`):

1.  Import your target icon from `lucide-react`.
2.  Add your tool definition to `toolsRegistry` in `src/akira-os/tools/registry.ts`:
    ```typescript
    {
      id: "analytics",
      name: "Analytics",
      description: "Visualize focus sessions, task completion, and growth trends over time.",
      icon: BarChart3,
      route: "/tools/analytics",
      category: "Productivity",
      status: "coming-soon",
      enabled: false,
      order: 2,
    }
    ```
3.  Implement the page component at the corresponding route (`src/routes/tools.analytics.tsx`).
