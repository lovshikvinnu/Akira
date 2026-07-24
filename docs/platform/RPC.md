# Platform Subsystem: RPC Serialization Layer

AKIRA OS separates user interface views from database engines using an RPC (Remote Procedure Call) layer. Even though the application runs entirely on a single machine, serialization prevents database connections from leaking into browser code bundles.

---

## 1. The Call Sequence

Data write requests proceed through the following sequence:

```
[ Client Environment (Browser) ]
              │
              ▼
    1. User Interaction (React Component)
              │
              ▼
    2. Client Service Call (e.g., notesService.add)
              │
              ▼
    3. RPC Server Function (persistAddNote)
              │
    ~~~~~~~~~~│~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ [ Serialization Boundary ]
              │
[ Server Environment (SSR/Server Functions runtime) ]
              │
              ▼
    4. Repository Resolution (SqliteNoteRepository)
              │
              ▼
    5. SQL Execution (better-sqlite3)
```

---

## 2. Why This Separation Exists

1.  **Security and Environment Boundary**: `better-sqlite3` compiles native C bindings that cannot run inside browser WebAssembly or layout threads. The RPC boundary limits database drivers to server-side environments.
2.  **Asset Bundle Size**: Database query text, SQL scripts, and schema files are excluded from frontend compilation, keeping client bundles lightweight.
3.  **Encapsulation**: Components do not know how data is saved (SQLite, JSON files, or API endpoints). They interact with services via simple TypeScript interfaces.
4.  **Audit Logs & Triggers**: Operations run through server-side validators before hitting SQL tables, enabling input sanitization and trigger checks.

---

## 3. Code Examples

### 3.1. Client Service Hook Call
When the user adds a note, they trigger the client service:

```typescript
// Location: src/akira-os/notes/index.ts
export const notesService = {
  async add(input: AddNoteInput): Promise<string> {
    // 1. Trigger the serialized RPC function
    return persistAddNote({ data: input });
  }
};
```

### 3.2. RPC Definition (Server Boundary)
The server function validates inputs before executing repository methods:

```typescript
// Location: src/akira-os/notes/index.ts
import { createServerFn } from "@tanstack/react-start";

export const persistAddNote = createServerFn({ method: "POST" })
  .validator((input: AddNoteInput) => input)
  .handler(async ({ data: input }) => {
    // 2. Dynamically import the repository to ensure it only runs on the server
    const { noteRepository } = await import("../../persistence/repositories");
    
    // 3. Delegate to the SQLite repository
    return noteRepository.add(input);
  });
```

### 3.3. SQLite Repository (Server-Side Only)
Executes the SQL prepared statement and returns the insert status:

```typescript
// Location: src/persistence/repositories/SqliteNoteRepository.ts
import { getDatabaseConnection } from "../connection";

export const SqliteNoteRepository = {
  add(input: AddNoteInput): string {
    const db = getDatabaseConnection();
    const id = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO notes (id, title, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title ?? "Untitled",
      input.content,
      JSON.stringify(input.tags ?? []),
      new Date().toISOString(),
      new Date().toISOString()
    );
    
    return id;
  }
};
```
