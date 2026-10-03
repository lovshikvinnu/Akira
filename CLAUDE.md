# CLAUDE.md — AKIRA OS

Working agreement for Claude Code in this repository. This file is a **router**, not a
copy: the governance documents below are authoritative and must be read before touching
the areas they own. Summaries here exist only to stop you from getting it wrong before
you have opened the right document.

---

## 1. Read this before you edit

| Before you touch…                                    | Read first                                  |
| ---------------------------------------------------- | ------------------------------------------- |
| Anything at all (mission, scope, minimal-change rule) | [AGENTS.md](AGENTS.md)                      |
| A module under `src/akira-os/`, or add a new module   | [MODULE_CONTRACT.md](MODULE_CONTRACT.md)    |
| Any `.ts`/`.tsx` file (naming, imports, error style)  | [CODE_STYLE.md](CODE_STYLE.md)              |
| Data flow, RPC, SQLite schema, GENESIS memory flow    | [ARCHITECTURE.md](ARCHITECTURE.md)          |
| Adding, moving, or renaming files/folders             | [DIRECTORY_STRUCTURE.md](DIRECTORY_STRUCTURE.md) |
| Tests, DB mocking, temp-database conventions          | [TESTING.md](TESTING.md)                    |
| Branching, commits, PR size, the verify pipeline      | [CONTRIBUTING.md](CONTRIBUTING.md)          |
| Who owns a subsystem / who must review                | [OWNERSHIP.md](OWNERSHIP.md), [CODEOWNERS](CODEOWNERS) |

Architecture decisions live in `docs/adr/`; module APIs in `docs/modules/`; platform
guides in `docs/platform/`.

---

## 2. Non-negotiable invariants

These are the rules whose violation is expensive to undo. Each cites its source.

1. **UI never reaches the database.** Components, hooks, and routes must not import
   repositories, `better-sqlite3`, or `persistence/connection`. Reads go through
   reactive hooks and the `akira` store; writes go through client services, which
   dispatch RPCs. *(MODULE_CONTRACT 2.1 and 2.4; ARCHITECTURE §2.3)*
   Importing a repository **contract** as a `import type` is fine — it is a type, not a
   connection.
2. **Routes are controllers.** Files under `src/routes/` mount container components and
   nothing else. No business or data logic. *(MODULE_CONTRACT 2.2)*
3. **Services are the single client entry point** for modifications. *(MODULE_CONTRACT 2.3)*
4. **No viewport math in modules.** No resize listeners, no pixel offset calculation, no
   hardcoded page dimensions. `Shell.tsx` owns layout; use Flexbox/Grid.
   *(MODULE_CONTRACT 2.5; CONTRIBUTING §4)*
5. **New platform modules register in `src/akira-os/tools/registry.ts`.**
   *(MODULE_CONTRACT 2.6)*
6. **`process.exit` is prohibited under `src/`** — CLI entrypoints in `scripts/` only.
   Enforced by ESLint `no-restricted-properties`. *(AGENTS.md; CONTRIBUTING §4)*
7. **GENESIS has no write access to the workspace database.** It ingests through the
   read-only `WorkspaceProvider`. *(ARCHITECTURE §5)*
8. **Use the `@/` alias**, never deep relative paths. *(CODE_STYLE §4)*

The repository is currently **clean** against 1–6. A PostToolUse guard
(`scripts/check-module-boundaries.mjs`) re-checks 1 on every edit; the rest need human or
subagent judgement — see `/pre-pr` and the `contract-auditor` subagent.

---

## 3. Verification

Run before proposing a change is finished:

```bash
npm run verify
```

which chains `lint → type-check → vitest run → verify:observability`. Prefer the
`/pre-pr` skill, which runs the same pipeline plus `validate:architecture` and uses the
reporter caveat below.

Two things about this pipeline are counter-intuitive and are **deliberate** — do not
"fix" them:

- **There is no separate `npm run build` step.** `verify:observability` runs `vite build`
  itself and aborts on failure, so build compilation is already covered. Adding a build
  step would build twice. *(CONTRIBUTING §3)*
- **`verify:observability` is not a vitest test.** `.output/` is gitignored, so a test
  would skip silently on a fresh clone — the exact failure mode it guards against. It
  catches observability being tree-shaken out of the production bundle, which no test can
  see because vitest does not tree-shake. *(see the header of
  `scripts/verify-observability-reachability.ts`, and ADR-022)*

### Reporter caveat — verified, not folklore

`vitest run` under the **default reporter suppresses stderr emitted from passing tests**.
Measured on `tests/genesis-persistence.test.ts`:

| reporter          | output lines | stderr blocks | `FOREIGN KEY constraint failed` shown |
| ----------------- | ------------ | ------------- | ------------------------------------- |
| default           | 10           | 0             | **0**                                 |
| `--reporter=dot`  | 765          | 7             | **73**                                |

Exit code and pass counts are identical (0, all passing) either way. What is hidden is not
a failing test — it is the evidence of **swallowed writes inside a green test**. When
touching persistence or GENESIS durability, run `npx vitest run --reporter=dot` and read
the stderr.

### Lint caveat

`git config core.autocrlf` is `true` on this machine. Without normalization, `npm run lint`
reports ~11,500 errors of which ~99% are `prettier/prettier: Delete ␍`, burying the real
ones. `.gitattributes` + `"endOfLine": "lf"` in `.prettierrc` + the format-on-edit hook
address this. If you ever see a four-figure lint count, check line endings before
believing it.

---

## 4. Working style

From [AGENTS.md](AGENTS.md), which is authoritative:

- Preserve simplicity; never overengineer. Make the **smallest** change that works.
- Reuse existing components and services. Preserve the folder structure.
- Do not redesign UI unless asked. Do not add dependencies.
- Explain the implementation plan before editing code.
- Finish one complete feature before starting another.

Commits follow `type(scope): summary` — see CONTRIBUTING §3.2. Branch off `develop`;
keep PRs under 400 lines.

---

## 5. GENESIS performance work

`src/genesis/` is 218 files and perf-sensitive. Absolute per-action latency on this
hardware is not measurable to better than ~3x, so **never quote a before/after timing from
two separate runs.**

The validated protocol lives in `tests/support/perf-ab.ts` — read its header before making
any performance claim. Use `interleavedAB()` / `describeAB()`; an effect is reportable only
above `MIN_TRUSTWORTHY_MS` (0.162 ms, twice the measured floor). Prefer a deterministic
count over a timing wherever one exists. The `/bench-genesis` skill drives this.

Benches are `tests/**/*.bench.ts` and are **not** collected by `vitest run` — they need
`--config vitest.bench.config.ts`. This separation is intentional: two sessions share this
working tree and a bench left in the default suite perturbs the other session's run.
