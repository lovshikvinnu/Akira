# CONTRIBUTING TO AKIRA

Welcome! This document outlines the contribution workflow, repository rules, and engineering standards for the two-developer team working on **AKIRA**.

---

## 1. Git Workflow & Branching Strategy

We follow a structured Git branching strategy to ensure a clean release line while allowing concurrent development.

```text
main      ============================= [Production / Release Version]
           ^                     ▲
           │                     │ (Hotfixes only)
develop    └─===================─┴───── [Integration / Next Release Stage]
              ▲         ▲
              │         │
feature/*  ───┴─────────┼────────────── [New features / Tasks]
                        │
bugfix/*   ─────────────┴────────────── [Bug fixes & patches]
```

### Branch Naming Conventions
* **Production Line**: `main` (Protected. Represents the current live/desktop release).
* **Development Line**: `develop` (Protected. All feature branches merge here first).
* **Feature Branches**: `feature/<issue-id>-<short-description>` (e.g., `feature/ak-102-notes-vault`). Used for developing new capabilities or refactoring.
* **Bug Fixes**: `bugfix/<issue-id>-<short-description>` (e.g., `bugfix/ak-204-sqlite-locking`). Used for addressing bugs on `develop`.
* **Hotfixes**: `hotfix/<issue-id>-<short-description>` (e.g., `hotfix/ak-301-auth-crash`). Used to patch critical issues directly in production; branches off `main` and merges to both `main` and `develop`.
* **Release Branches**: `release/<version-tag>` (e.g., `release/v1.2.0`). Used for release preparation and final QA audits; branches off `develop` and merges into `main` and `develop`.

---

## 2. Development & Pull Request (PR) Process

1. **Local Setup**: Create a branch off `develop` (for features/bugfixes) or `main` (for hotfixes).
2. **Commit Messages**: Write semantic, meaningful commit messages:
   * Format: `<type>(<scope>): <short description>`
   * Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.
   * Example: `feat(memory): implement story importance decay function`
3. **Open a PR**: Target your PR to merge into `develop`.
4. **CI/CD Checks**: Ensure all of the following pass before requesting reviews:
   * Compilation: `npm run build`
   * Type checking: `npm run type-check` (or `tsc --noEmit`)
   * Linting: `npm run lint`
   * Formatting: `npm run format:check` (Prettier validation)
5. **Merge Strategy**: Use **Squash and Merge** for feature branches to keep the `develop` history clean and linear.

---

## 3. Sprint Workflow

We use a lightweight, iterative sprint workflow:
* **Sprint Duration**: 1–2 weeks.
* **Planning (Day 1)**: Align on the sprint goal and assign tickets. One developer owns each feature fully.
* **Execution**: Developers work in parallel on their owned modules.
* **Sprint Freeze (Last Day)**: No new feature branches are merged. The team focuses entirely on testing, fixing bugs, and writing/updating tests.
* **Release Audit**: Before merging `develop` to `main`, a release manager (Release Auditor) conducts a complete audit (similar to `ARCHITECTURE.md` guidelines) to verify compliance.

---

## 4. Code Review Expectations

* **Reviewers**:
  * **GENESIS changes**: Must be approved by the **Founder / CTO** (Developer A).
  * **AKIRA OS changes**: Must be approved by the **Platform Lead** (Developer B).
  * **Shared or Contracts changes**: Require approval from **both** developers.
* **Core Checklist for Reviewers**:
  * Does the change violate the [Architecture Constitution](file:///docs/shared/architecture/architecture.md)?
  * Are there any forbidden imports (e.g., GENESIS importing OS internals directly)?
  * Did this change introduce circular dependencies?
  * Is the code covered by unit tests (especially in core engines)?
  * Are SQLite operations fully confined to Repositories?
  * Is there any runtime regression?

---

## 5. Architectural & Repository Rules

* **Preserve Simplicity**: Avoid overengineering. Prefer readability, modularity, and maintainability.
* **Small PRs**: Keep PRs under 400 lines of code change where possible to make review cycles fast and thorough.
* **No Inline SQL**: All database access must go through the Repository pattern. Never write raw SQL directly in UI files or components.
* **Keep Docs Updated**: Any change affecting public contracts or subsystem boundaries must be documented immediately in the corresponding folder in the `docs/` hierarchy.
