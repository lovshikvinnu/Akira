/**
 * The validated A/B protocol for GENESIS performance claims.
 *
 * Not a test and not a bench: the default vitest `include` matches
 * `**\/*.{test,spec}.*` and the bench config matches `tests/**\/*.bench.ts`, so
 * this file is collected by neither. It is a helper the benches import.
 *
 * WHY THIS EXISTS
 * ---------------
 * Absolute per-action latency is not measurable on this hardware to better than
 * ~3x: six runs of one commit through one harness produced medians from 3.89 to
 * 11.17 ms. Every attempt to rescue absolutes failed, and each failure is
 * encoded as a rule below rather than left to be rediscovered.
 *
 * WHAT WAS TRIED AND REJECTED
 * ---------------------------
 *   CPU time instead of wall time. `process.cpuUsage()` on this platform has
 *     ~16 ms granularity -- 40 timed 1 ms spins produced 3 distinct readings,
 *     all either 0 or 16 ms. It cannot resolve a 5 ms action, let alone a
 *     0.3 ms effect, and the cpu/wall "was I descheduled" ratio reads 0.00 for
 *     the same reason. Dead end, not a subtle one.
 *
 *   An external load proxy. `tasklist | grep -ci node.exe` samples an instant,
 *     so a reading taken before or after a run cannot see load that spikes and
 *     subsides inside it. It read 0 during both the fast and the slow regimes.
 *     Any "the machine was quiet" qualifier attached to a figure on that basis
 *     is unsupported.
 *
 *   `min` as the robust statistic. Rejected on measurement: a null A/B gave
 *     -0.285 ms and an injected effect of 0.323 ms was reported as 1.422 ms, a
 *     4.4x overstatement. `min` takes the single luckiest action per arm, so it
 *     is extreme-value noise once both arms already share conditions. It was
 *     useful only for cross-process comparison under sustained load asymmetry,
 *     which this protocol removes the need for.
 *
 * WHAT WORKS
 * ----------
 * Pairing, not load measurement. Interleaving the two arms *per sample* inside
 * one process makes both arms experience the same machine conditions, the same
 * GC state and the same JIT state, so the paired difference survives conditions
 * that make either arm's absolute meaningless. Measured noise floor on a null
 * A/B (identical code in both arms):
 *
 *     samples per arm      apparent effect, worst observed
 *     50                   0.235 ms
 *     200                  0.081 ms
 *
 * and an injected ~500-allocation cost was recovered at 0.15-0.34 ms against
 * that floor -- detectable, and not overstated the way `min` overstated it.
 *
 * Warm-up is real and its direction is not predictable. The first block of ~50
 * samples came out at 8.42, 3.16 and 8.32 ms in three runs whose subsequent
 * plateau was ~5.3 ms every time. So discard a prefix; do not assume it is slow.
 *
 * The workload itself is stationary, which was checked rather than assumed: the
 * task list grows 501 -> 901 across a run while retention pins memories at 501,
 * and per-action cost showed no trend against it. So growth in `state.tasks` is
 * not a confound, and the earlier suspicion that it was is retracted.
 *
 * HOW TO STATE A CLAIM
 * --------------------
 * An effect is reportable when it exceeds {@link MIN_TRUSTWORTHY_MS}, which is
 * twice the measured floor. Below that, say "below this harness's resolution"
 * rather than quoting a number. Prefer a deterministic count where one exists:
 * counts are immune to all of the above, and both landed recall optimisations
 * rest on them.
 */

/** Worst apparent effect observed on a null A/B at 200 samples per arm. */
export const NOISE_FLOOR_MS = 0.081;

/** Twice the floor. Effects smaller than this are not reportable from timings. */
export const MIN_TRUSTWORTHY_MS = 0.162;

/** Samples per arm. 50 admits ~0.24 ms false effects; 200 floors at ~0.08 ms. */
export const DEFAULT_SAMPLES = 200;

/** Discarded prefix. Block 0 was an outlier in every run, in both directions. */
export const DEFAULT_WARMUP = 50;

export interface Stats {
  readonly p10: number;
  readonly median: number;
  readonly trimmed: number;
  readonly p90: number;
}

export interface ABResult {
  readonly samples: number;
  readonly a: Stats;
  readonly b: Stats;
  /** b - a, so a positive effect means arm B is slower. */
  readonly effect: { readonly median: number; readonly trimmed: number };
  /** Whether |effect| clears twice the measured noise floor. */
  readonly reportable: boolean;
  /** Apparent effect of arm A against itself, measured in the same conditions. */
  readonly nullEffect?: { readonly median: number; readonly trimmed: number };
}

function at(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/** Mean of the middle 50%: discards descheduling spikes and lucky lows alike. */
export function trimmedMean(xs: readonly number[]): number {
  const a = xs.slice().sort((p, q) => p - q);
  const slice = a.slice(Math.floor(a.length * 0.25), Math.ceil(a.length * 0.75));
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

export function statsOf(xs: readonly number[]): Stats {
  const a = xs.slice().sort((p, q) => p - q);
  return { p10: at(a, 0.1), median: at(a, 0.5), trimmed: trimmedMean(xs), p90: at(a, 0.9) };
}

function time(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

/**
 * Runs two arms interleaved per sample and reports the paired difference.
 *
 * `withNullCheck` additionally measures arm A against itself under the same
 * conditions, so a run reports its own floor rather than relying on the floor
 * measured on some other day. That is the difference between "this protocol
 * usually resolves 0.08 ms" and "this run resolved 0.08 ms", and it is cheap.
 *
 * Both arms must be semantically equivalent and the caller must have checked
 * that separately -- a timing comparison between arms that disagree measures
 * the wrong thing.
 */
export function interleavedAB(opts: {
  armA: () => void;
  armB: () => void;
  samples?: number;
  warmup?: number;
  withNullCheck?: boolean;
}): ABResult {
  const samples = opts.samples ?? DEFAULT_SAMPLES;
  const warmup = opts.warmup ?? DEFAULT_WARMUP;

  for (let i = 0; i < warmup; i++) {
    opts.armA();
    opts.armB();
  }

  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < samples; i++) {
    a.push(time(opts.armA));
    b.push(time(opts.armB));
  }

  let nullEffect: ABResult["nullEffect"];
  if (opts.withNullCheck) {
    const n1: number[] = [];
    const n2: number[] = [];
    for (let i = 0; i < samples; i++) {
      n1.push(time(opts.armA));
      n2.push(time(opts.armA));
    }
    nullEffect = {
      median: statsOf(n2).median - statsOf(n1).median,
      trimmed: trimmedMean(n2) - trimmedMean(n1),
    };
  }

  const sa = statsOf(a);
  const sb = statsOf(b);
  const effect = { median: sb.median - sa.median, trimmed: sb.trimmed - sa.trimmed };
  return {
    samples,
    a: sa,
    b: sb,
    effect,
    reportable: Math.abs(effect.trimmed) >= MIN_TRUSTWORTHY_MS,
    nullEffect,
  };
}

/** Human-readable verdict, including the refusal case. */
export function describeAB(label: string, r: ABResult): string {
  const lines = [
    `${label}  (${r.samples} samples/arm, interleaved)`,
    `  arm A  p10=${r.a.p10.toFixed(3)} median=${r.a.median.toFixed(3)} trimmed=${r.a.trimmed.toFixed(3)} p90=${r.a.p90.toFixed(3)}`,
    `  arm B  p10=${r.b.p10.toFixed(3)} median=${r.b.median.toFixed(3)} trimmed=${r.b.trimmed.toFixed(3)} p90=${r.b.p90.toFixed(3)}`,
    `  effect (B-A)  median=${r.effect.median.toFixed(3)}  trimmed=${r.effect.trimmed.toFixed(3)} ms`,
  ];
  if (r.nullEffect) {
    lines.push(
      `  null floor this run  median=${r.nullEffect.median.toFixed(3)}  trimmed=${r.nullEffect.trimmed.toFixed(3)} ms`,
    );
  }
  lines.push(
    r.reportable
      ? `  REPORTABLE: |${r.effect.trimmed.toFixed(3)}| >= ${MIN_TRUSTWORTHY_MS} ms`
      : `  NOT REPORTABLE: |${r.effect.trimmed.toFixed(3)}| < ${MIN_TRUSTWORTHY_MS} ms — below this harness's resolution`,
  );
  return lines.join("\n");
}
