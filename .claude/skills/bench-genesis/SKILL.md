---
name: bench-genesis
description: Measure a GENESIS performance change using the repository's validated paired A/B protocol, and decide whether the result is reportable or below the harness noise floor.
disable-model-invocation: true
---

# /bench-genesis — GENESIS performance measurement

The methodology is **already implemented** in `tests/support/perf-ab.ts`. Read
its header before doing anything else — it records what was tried and rejected,
and re-deriving any of it wastes hours. This skill is the procedure for using
it, not a second copy of it.

## The one rule

**Never quote a before/after timing taken from two separate runs.** Six runs of
a single commit through `tests/genesis-perf.bench.ts` produced medians from
**3.89 ms to 11.17 ms** — a 2.9x span with byte-identical deterministic counts.
Absolute per-action latency is not measurable on this hardware. Any figure
derived by comparing run A to run B is noise wearing a decimal point.

## Pick the right harness

| Question | Harness |
| --- | --- |
| "Which phase dominates the action?" | `tests/genesis-perf.bench.ts` — read **phase share**, a ratio, which held 36–38% for recall across that entire 2.9x span. Ratios survive; absolutes do not. |
| "Does this change make it faster?" | `interleavedAB()` from `tests/support/perf-ab.ts`. |
| "Is the harness itself trustworthy today?" | `tests/genesis-perf-ab-validation.bench.ts` — measures a null and an injected cost, and must report `null reportable=false, signal reportable=true`. |
| "Did the work change at all?" | A deterministic count. Prefer this over any timing — see below. |

## Prefer a count over a timing

Counts are immune to every problem above, and **both landed recall
optimisations rest on them**. Before reaching for a stopwatch, ask whether the
change shows up as a countable: normalisations performed, candidates scored,
relationships created, memories read, string allocations. If it does, count it
and stop. A count of 500 → 0 is a stronger claim than any millisecond figure
this hardware can produce.

## Running an A/B

Benches are **not** collected by `npx vitest run` — the default `include` cannot
match `*.bench.ts`. That separation is deliberate: this working tree is
sometimes shared with a second session, and a bench in the default suite
perturbs their run. Always pass the bench config:

```bash
npx vitest run --config vitest.bench.config.ts tests/<your>.bench.ts
```

Write output to a file via `PERF_OUT` (both existing benches follow this), so
the result survives the scrollback:

```bash
PERF_OUT=/tmp/genesis-ab.txt npx vitest run --config vitest.bench.config.ts tests/<your>.bench.ts
```

A new bench follows the shape of `tests/genesis-declaration-title-source.bench.ts`:

```ts
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { interleavedAB, describeAB } from "./support/perf-ab";

const result = interleavedAB({
  armA: () => void subjectUnderTest(todayInputs),
  armB: () => void subjectUnderTest(changedInputs),
  samples: 200,
  withNullCheck: true,
});
log(describeAB("change (B) vs today (A), run 1", result));
```

Then **run the same A/B a second time in the same file** and log it as `run 2`.
Both existing A/B benches do this. An effect that is real reproduces; one that
flips sign or magnitude between adjacent runs was noise.

## Non-negotiable parameters

- `samples: 200`. At 50 the floor is ~0.235 ms; at 200 it is ~0.081 ms.
- `withNullCheck: true`. This measures arm A against **itself** under the same
  conditions, so the run reports *its own* floor instead of inheriting one
  measured on another day. It is cheap; there is no reason to omit it.
- Leave `warmup` at the default 50. The first block was an outlier in every run
  observed, **in both directions** (8.42, 3.16, 8.32 ms against a ~5.3 ms
  plateau) — so discard the prefix, and never assume warm-up means "slow".
- **The two arms must be semantically equivalent, and you must verify that
  separately.** A timing comparison between arms that compute different answers
  measures the wrong thing. `perf-ab.ts` cannot check this for you.

## Reading the verdict

`describeAB()` prints the decision. The statistic that decides it is the
**trimmed mean** — the mean of the middle 50%, which discards descheduling
spikes and lucky lows alike. Medians are printed alongside; `p10`/`p90` show the
spread.

- `REPORTABLE` — `|effect.trimmed| >= MIN_TRUSTWORTHY_MS` (0.162 ms, twice the
  measured floor). You may state the number.
- `NOT REPORTABLE` — say **"below this harness's resolution"**. Do not quote the
  figure, do not call it "a small improvement", and do not call it a regression.
  Below the floor the sign itself is not trustworthy.

Sanity-check the run's own null floor in the output. If `null floor` is not
comfortably under the effect you are claiming, the machine was too noisy and the
run should be repeated rather than reported.

## Rejected approaches — do not retry these

Each was measured and failed. They look reasonable, which is why they are named:

- **`process.cpuUsage()` instead of wall time.** ~16 ms granularity on this
  platform; 40 timed 1 ms spins produced three distinct readings, all 0 or 16.
  It cannot resolve a 5 ms action, let alone a 0.3 ms effect.
- **An external load proxy** (`tasklist | grep -c node.exe`). Samples an
  instant, so it cannot see load that spikes and subsides inside a run. It read
  0 during both the fast and the slow regimes. Never attach "the machine was
  quiet" to a figure on that basis.
- **`min` as the robust statistic.** A null A/B gave −0.285 ms, and a true
  0.323 ms effect was reported as 1.422 ms — a 4.4x overstatement. `min` takes
  the single luckiest action per arm.
- **Blaming workload growth.** Checked, not assumed: the task list grows
  501 → 901 across a run while retention pins memories at 501, and per-action
  cost showed no trend against it. That earlier suspicion is retracted.

## Reporting

State, in this order: the deterministic count if one exists; then the paired
effect with its samples-per-arm and the run's own null floor; then whether it
cleared the threshold. Name the harness and say the figure is paired-difference,
not absolute latency. If it did not clear the floor, say so plainly — a refusal
to report is a valid and expected outcome of this protocol, not a failed
measurement.
