# AKIRA OS Code Style & Conventions

This document outlines the coding style, naming conventions, directory import rules, and error handling guidelines enforced in the AKIRA OS repository.

---

## 1. TypeScript Conventions

*   **Strict Typing**: Always compile with strict typescript configurations. Avoid utilizing `any`. If a type is unknown or polymorphic, prefer `unknown` or define union types.
*   **Interfaces vs Types**:
    *   Use `interface` for declaring contracts and shapes (e.g. repositories, services, provider hooks).
    *   Use `type` for simple unions, tuples, intersections, or primitives.
*   **Explicit Returns**: Declare return types explicitly for all public API functions and client services.
    *   *Correct*: `async add(input: NoteInput): Promise<string>`
    *   *Incorrect*: `async add(input: NoteInput)`

---

## 2. React Conventions

*   **Functional Components**: Always write React components as functions. Do not use class-based components.
*   **State Hook Placement**: Group hooks at the beginning of the component definition. Keep selectors scoped and specific to prevent unnecessary layout renders.
*   **Conditional Renders**: Avoid nested ternary operators in JSX layout code. Extract complicated layouts into smaller sub-components.
*   **Tailwind & Styling CSS Rules**:
    *   Use predefined custom styles in `styles.css` (e.g. `.glass-panel`, `.btn-glow`, `.text-gradient-akira`) for recurring styling elements.
    *   Do not hardcode pixel margins or colors. Use spacing tokens and semantic CSS properties.

---

## 3. Naming Conventions

### 3.1. File Naming
*   **React Components**: PascalCase (e.g. `Sidebar.tsx`, `AnalyticsPanel.tsx`).
*   **Services & Classes**: PascalCase (e.g. `VaultStorageService.ts`).
*   **Repository Contracts**: PascalCase (e.g. `NoteRepository.ts`).
*   **Utility & General Files**: kebab-case (e.g. `store-init.ts`, `error-reporting.ts`).
*   **Routing Pages**: File routing matches path expectations (e.g., `projects.tsx`, `projects.$id.tsx`).

### 3.2. Code Symbols
*   **Variables, Parameters, Fields**: camelCase (e.g. `tempSourcePath`, `displayName`).
*   **Types, Interfaces, Classes**: PascalCase (e.g. `WorkspaceProvider`).
*   **Constants & Enums**: UPPER_SNAKE_CASE (e.g. `STORAGE_KEY`, `Events.PROJECT_CREATED`).
*   **Custom Hooks**: Prefixed with `use` (e.g. `useAkira`, `useAkiraHydrated`).

---

## 4. Import Guidelines

*   **Path Aliases**: Utilize the `@/` path alias pointing to the `src/` directory to prevent long relative path declarations.
    *   *Correct*: `import { Shell } from "@/app/shell/Shell";`
    *   *Incorrect*: `import { Shell } from "../../app/shell/Shell";`
*   **Group Imports**: Organize imports chronologically:
    1.  React and official packages.
    2.  Third-party modules and libraries.
    3.  Internal alias modules (`@/`).
    4.  Local relative files.
    5.  Stylesheets (`styles.css`).

---

## 5. Component Layout Structure

Structure React component files using the layout below:

```tsx
// 1. Imports
import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

// 2. Types & Interfaces
interface PanelProps {
  title: string;
}

// 3. Main Component
export function FeaturePanel({ title }: PanelProps) {
  // 3.1. Hooks
  const [active, setActive] = useState(false);

  // 3.2. Effects
  useEffect(() => {
    // Initialization logic...
  }, []);

  // 3.3. Handlers
  const handleToggle = () => setActive(!active);

  // 3.4. JSX Output
  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        {title}
      </h2>
      <button onClick={handleToggle} className="btn-glow mt-4">
        {active ? "Active" : "Inactive"}
      </button>
    </div>
  );
}
```

---

## 6. Error Handling Strategy

*   **Boundary Wrapping**: Wrap hazardous operations (filesystems, SQLite runs, network fetch queries) inside `try/catch` statements.
*   **Graceful Degrades**: Do not crash the application if a call fails. Display fallback states, send logs to `reportLovableError`, and present clear sonner toasts to the user.
*   **catastrophic Interceptions**: For major crashes, React boundaries will capture errors and prompt recovery redirects without losing current workspace states.

---

## 7. Comments & Documentation

*   **JSDoc Documentation**: Write JSDoc comments on all public interfaces, service methods, and database helper files.
*   **Code Intent Comments**: Comment on *why* a particular workaround or performance tweak is made, not *what* the syntax is doing.
*   **Maintain Comments**: Always keep comments updated when modifying code. Delete dead code blocks instead of leaving them commented out.
