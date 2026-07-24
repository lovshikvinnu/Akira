# AKIRA OS Module Engineering Contract

This document outlines the mandatory design constraints, directory structures, import policies, and architectural boundaries that all modules in AKIRA OS must follow. Compliance with this contract is verified during integration.

---

## 1. Directory Structure Blueprint

Each module under `src/akira-os/` or future modules (e.g. `analytics`, `titan`, `forge`) must follow the structure below:

```
src/akira-os/<module-name>/
├── components/          # React Presentation Elements (No business logic)
├── hooks/               # Local React UI Hooks (Mutations, selections, fetch queries)
├── services/            # Client Entry Services (Dispatches store state & runs RPCs)
├── server/              # Server Functions (TanStack Start RPC createServerFn)
├── repositories/        # SQLite Persistence Handlers (Raw SQL executing prepared statements)
├── types/               # TypeScript Definitions and Interfaces
├── tests/               # Unit, Integration, and DB Mocking Suites
└── index.ts             # Module Entry Barrel Export
```

---

## 2. Mandatory Boundary Rules

Engineers must adhere to the following import/dependency guidelines:

### Rule 2.1: UI Isolation
*   **Components and Hooks must never import repositories directly.** 
    *   *Incorrect*: `import { sqliteNoteRepository } from "../persistence/repositories";` inside a React button.
    *   *Correct*: Components must interact with state through client Hooks or the `akira` store, which dispatches changes to services.

### Rule 2.2: Routing Decoupling
*   **Routes must not contain business or data logic.** Routes under `src/routes/` should only import container components and mount pages. They act strictly as controllers.

### Rule 2.3: Service Dominance
*   **Services are the single entry point for client modifications.** They coordinates local state modifications, dispatch event bus signals, and start the background RPC communication.

### Rule 2.4: Server Isolation
*   **Repositories are strictly server-only.** They can only be imported within server functions (`server/` folder or server validation checks). They should never be bundled into the client build assets.

### Rule 2.5: Viewport Independence
*   **Modules must never calculate viewport dimensions.** Avoid listening to resize triggers or adjusting pixel offsets. Shell layouts are owned by `Shell.tsx`; components should utilize standard CSS layout tools (Flexbox, CSS Grid).

### Rule 2.6: Registration
*   **All new platform modules must register through the Tool Registry.** They must declare metadata inside `src/akira-os/tools/registry.ts`.

---

## 3. Implementation Example

Below is a compliant module implementation example for a hypothetical `Analytics` tracker:

### 3.1. Repository (Server Context Only)
`src/akira-os/analytics/repositories/SqliteAnalyticsRepository.ts`:
```typescript
import { getDatabaseConnection } from "../../../persistence/connection";

export interface AnalyticsRepository {
  getFocusDurationSum(projectId: string): number;
}

export const sqliteAnalyticsRepository: AnalyticsRepository = {
  getFocusDurationSum(projectId: string): number {
    const db = getDatabaseConnection();
    const row = db
      .prepare("SELECT SUM(duration) as total FROM sessions WHERE project_id = ?")
      .get(projectId) as { total: number | null };
    return row?.total ?? 0;
  }
};
```

### 3.2. Server RPC Layer
`src/akira-os/analytics/server/index.ts`:
```typescript
import { createServerFn } from "@tanstack/react-start";

export const persistFetchAnalytics = createServerFn({ method: "GET" })
  .validator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    const { sqliteAnalyticsRepository } = await import("../repositories/SqliteAnalyticsRepository");
    return sqliteAnalyticsRepository.getFocusDurationSum(projectId);
  });
```

### 3.3. Client Service
`src/akira-os/analytics/services/analyticsService.ts`:
```typescript
import { persistFetchAnalytics } from "../server";

export const analyticsService = {
  async getDurationSum(projectId: string): Promise<number> {
    // Perform safety checks, dispatch events if needed
    return persistFetchAnalytics({ data: projectId });
  }
};
```

### 3.4. UI Component
`src/akira-os/analytics/components/AnalyticsPanel.tsx`:
```tsx
import { useEffect, useState } from "react";
import { analyticsService } from "../services/analyticsService";

export function AnalyticsPanel({ projectId }: { projectId: string }) {
  const [totalTime, setTotalTime] = useState<number>(0);

  useEffect(() => {
    analyticsService.getDurationSum(projectId).then(setTotalTime);
  }, [projectId]);

  return (
    <div className="glass-panel p-4">
      <h3 className="text-sm font-medium">Focus Duration</h3>
      <p className="mt-1 text-2xl font-semibold">{totalTime} mins</p>
    </div>
  );
}
```

---

## 4. Architectural Anti-patterns

Avoid the following design flaws:
*   ❌ **SQL in React Components**: Writing raw queries or using SQLite Prepared Statements inside a `useEffect` Hook.
*   ❌ **Bypassing Services**: Calling RPC functions directly from components without updating the local store state cache.
*   ❌ **Hardcoded UI Colors**: Defining color tokens in component variables instead of utilizing Tailwind or `styles.css` custom property variables.
*   ❌ **Direct Cross-Module Database Edits**: Modifying a module's tables directly from another module. Utilize the `eventBus` to coordinate cross-subsystem state changes.
