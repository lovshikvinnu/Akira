# AKIRA OS Contributing Guidelines

Welcome to the AKIRA OS project. This document outlines the local setup instructions, branching conventions, pull request procedures, coding standards, test validation requirements, and documentation rules. Adhering to these standards ensures the codebase remains robust, maintainable, and aligned with our architecture.

---

## 1. Local Environment Setup

### 1.1. System Prerequisites

- **Node.js**: v18.18.0 or later (LTS recommended)
- **Package Manager**: `npm` (v10+) or `bun` (v1.0+)
- **Operating System**: Windows 10/11 (for desktop runner integration tests)

### 1.2. Installation Steps

1.  Clone the repository:
    ```bash
    git clone https://github.com/lovshikvinnu/AKIRA.git
    cd AKIRA
    ```
2.  Install project packages:
    ```bash
    npm install
    ```
3.  Boot the application development server to automatically run schema migrations and initialize the local SQLite database file:
    ```bash
    npm run dev
    ```

---

## 2. Git Branching Strategy

We follow a structured branching topology. All development work occurs in isolated branches. Direct commits to protected branches are disabled.

```
                  ┌───────────────┐
                  │     main      │  (Production-ready releases)
                  └───────▲───────┘
                          │ (Merge via Release QA Audit)
                  ┌───────┴───────┐
                  │    develop    │  (Primary integration branch)
                  └───────▲───────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
 ┌───────┴───────┐┌───────┴───────┐┌───────┴───────┐
 │   feature/*   ││   bugfix/*    ││   hotfix/*    │ (Development tasks)
 └───────────────┘└───────────────┘└───────────────┘
```

### 2.1. Branch Naming Conventions

- **Features**: `feature/<issue-id>-<brief-slug>` (e.g. `feature/ak-301-file-vault-indexing`)
- **Bugs**: `bugfix/<issue-id>-<brief-slug>` (e.g. `bugfix/ak-402-sqlite-locks`)
- **Hotfixes**: `hotfix/<issue-id>-<brief-slug>` (e.g. `hotfix/ak-509-crash-handler`)
- **Releases**: `release/v<major>.<minor>.<patch>` (e.g. `release/v1.2.0`)

---

## 3. Pull Request (PR) Workflow

1.  **Branch Creation**: Create your branch off the latest `develop` commit.
2.  **Commit Message Format**: Use semantic labels:
    - `feat(scope): ...` for new features.
    - `fix(scope): ...` for bug fixes.
    - `docs(scope): ...` for documentation updates.
    - `style(scope): ...` for styling adjustments.
    - `test(scope): ...` for adding tests.
    - _Example_: `feat(vault): add magic number validation checks for file uploads`
3.  **Local Checks**: Before opening a PR, run the verification pipeline:

    ```bash
    npm run verify        # lint -> type-check -> tests -> production build -> reachability
    ```

    It chains the individual checks, each of which can also be run alone:

    ```bash
    npm run lint                  # Lint inspection
    npm run type-check            # TypeScript compiler check
    npx vitest run                # Execute test suite once (npm run test watches)
    npm run verify:observability  # Production build, then bundle reachability
    ```

    `verify:observability` runs `vite build` itself and aborts if the build
    fails, so it covers build compilation as well — there is no separate
    `npm run build` step in the pipeline, and adding one would only build twice.

    **Why the last step exists.** It asserts that the observability subsystem
    actually survives bundling into _both_ the client and server output. That
    cannot be checked by the test suite: vitest does not tree-shake, so
    observability can be silently dropped from the production bundle while
    every test still passes. This has happened once already — see ADR-022. It
    is the only check here that needs a real production build, which is why it
    is a separate command and is deliberately not part of `npm run test`.

4.  **Submission**: Target `develop` as the merge destination. Keep PRs under 400 lines of code change to simplify reviews.
5.  **Merge Rule**: All integrations must be completed via **Squash and Merge** to maintain a linear history.

---

## 4. Coding Standards

- **TypeScript Isolation**: Every function must be typed. Avoid using `any` unless absolutely necessary (and compile with strict flags).
- **UI Declarative Separation**: Components must never execute database queries or call repositories directly. All reads occur via reactive hooks; all writes are called through client services.
- **No Magic Strings**: Group repeated strings (e.g., event names, toast types, settings keys) into static typescript constants.
- **Layout Boundaries**: Features must adapt to the flex/grid layouts provided by the Shell. Do not write custom screen dimensions calculations or hardcode page sizes.
- **Process Exit Rule**: `process.exit` is prohibited in source files; use CLI entry points only.

---

## 5. Testing Requirements

- **Database Testing**: All repository writes must be tested. Mock database environments are initialized inside the `tests/` directory to avoid modifying production data.
- **Coverage Rules**: Critical core engines (such as the File Vault storage pipeline and GENESIS AI modules) require unit test coverage.
- **Running Tests**:
  - Run once: `npx vitest run`
  - Watch mode: `npm run test` (bare `vitest` watches in an interactive terminal)

---

## 6. Documentation Maintenance

- **Continuous Updates**: If an API contract, database schema, or client service interface is updated, the change must be reflected in the documentation.
- **Folder Paths**:
  - Architecture documents: `ARCHITECTURE.md` at root.
  - System decisions: `docs/adr/`
  - Module APIs: `docs/modules/`
  - Platform guides: `docs/platform/`
- **Format Rules**: Write in markdown using absolute paths for cross-references. Do not create placeholder sections.
- **Developer Guide**: Updated guidelines are available at `docs/AKIRA-OS/DeveloperGuide.md`.
