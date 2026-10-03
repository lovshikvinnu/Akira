---
name: pre-pr
description: Run AKIRA's real pre-PR verification gauntlet and interpret the results, including the reporter caveat and the known-failing architecture assertions.
disable-model-invocation: true
---

# /pre-pr — AKIRA pre-pull-request verification

Run the checks below **in order** and stop at the first genuine failure. Report
results as a short table, then the details of anything that failed.

Everything here was checked against `package.json` rather than taken from the
docs. Where the two disagreed, the note says so.

---

## The pipeline

### 1. Lint

```bash
npm run lint
```

**Read the count before you read the errors.** `core.autocrlf` is `true` on the
Windows machines this repo is developed on. Before `.gitattributes` landed,
`npm run lint` reported **11,493 errors, 11,397 of which were
`prettier/prettier: Delete CR`** — 99.2% pure line-ending noise. If you see a
four-figure count, that is what it is; check line endings before believing any
of it:

```bash
git ls-files -z | xargs -0 grep -lU $'' -- '*.ts' '*.tsx' | head
```

Genuine errors are the non-`Delete CR` ones. To see only those:

```bash
npx eslint . -f json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);for(const f of r)for(const m of f.messages)if(!/Delete .␍|␍/.test(m.message))console.log(f.filePath+':'+m.line+' '+m.ruleId+' '+m.message)})"
```

### 2. Type check

```bash
npm run type-check
```

Clean baseline. Any output at all is a regression.

### 3. Tests — use the dot reporter

```bash
npx vitest run --reporter=dot
```

**Do not use the default reporter for a pre-PR run.** It suppresses stderr
emitted from *passing* tests. Measured on `tests/genesis-persistence.test.ts`,
same commit, same exit code 0, same passing count:

| reporter         | output lines | stderr blocks | `FOREIGN KEY constraint failed` shown |
| ---------------- | ------------ | ------------- | ------------------------------------- |
| default          | 10           | 0             | **0**                                 |
| `--reporter=dot` | 765          | 7             | **73**                                |

What the default hides is not a failing test — it is the evidence of a
**swallowed write inside a green test**. Baseline for the whole suite is
**85 files / 892 tests passing**. When the change touches persistence,
`src/genesis/` durability, or anything that writes, grep the output:

```bash
npx vitest run --reporter=dot 2>&1 | grep -iE "FOREIGN KEY|database is locked|failed to (persist|record|write)"
```

Treat a *new* line here as a finding even though the suite is green.

### 4. Production build + observability reachability

```bash
npm run verify:observability
```

This is the build step. **There is deliberately no separate `npm run build` in
the pipeline** — this script runs `vite build` itself and aborts if the build
fails, so adding one would build twice (CONTRIBUTING section 3). It then asserts
that `src/observability/auto-compose.ts` survived into *both* the client and
server bundles. No test can check that: vitest does not tree-shake, so
observability can vanish from production while the suite stays green. It has
happened once — see ADR-022 and the header of
`scripts/verify-observability-reachability.ts`.

If this fails after a rename, check that `package.json` `sideEffects` still
names the file.

### 5. Architecture validation

```bash
npm run validate:architecture
```

**This exits 1 today on a clean tree.** Known baseline: **361 assertions, 358
passed, 3 failed.** The three pre-existing failures are:

1. `Scenario 9: Runtime Cutover Verification` — `persist()` is not completely
   removed from `akira-store.ts`.
2. `Scenario 10: Repository & Server Boundary` — `timeline-fallback-durability.test.ts`
   has no `typeof window` server-side guard.
3. `Scenario 22: Instrumentation Architecture` — direct Event Bus imports outside
   `instrumentation/` in six files, including
   `src/genesis/context/context-resolution/service.ts` and
   `src/observability/composition.ts`.

Compare against that list. **`Failed: 3` and those same three scenarios means
you introduced nothing.** `Failed: 4`, or a different scenario name, is yours.

```bash
npm run validate:architecture 2>&1 | grep -E "^(Total assertions|Passed|Failed):|❌"
```

### Shortcut

`npm run verify` chains steps 1–4 (the documented gate, currently green).
`npm run verify:full` adds step 5 — expect exit 1 from the three known failures.
Run the steps individually when you want to read the output properly.

---

## Judgement rules

- **Green suite is not the same as no regression.** Step 3's grep matters more
  than the pass count for persistence and GENESIS work.
- **Do not "fix" the two deliberate oddities** — no separate build step, and
  observability being a script rather than a test. Both are load-bearing and
  documented; CLAUDE.md section 3 explains why.
- **Never add an architecture assertion to make the count go green.** The three
  failures are real debt; leave them visible.
- Performance claims need `/bench-genesis`, not a timing quoted from these runs.

---

## Report format

```
lint            <n> real errors (<n> CRLF noise)
type-check      clean | <n> errors
tests           <files>/<tests> passing, reporter=dot, <n> new stderr findings
observability   pass | fail
architecture    358/361 (3 known) | <deviation>
```

Then, for each failure: the file, the assertion, and whether it is pre-existing
or introduced by this change. Say which explicitly — never merge the two.
