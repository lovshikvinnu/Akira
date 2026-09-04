/**
 * Resource sampling, limited to what AKIRA can honestly measure.
 *
 * The frozen `ResourceRecord` model asks for five numbers: CPU load, RSS, heap,
 * event-loop lag and free disk. AKIRA runs both in a browser and in a Node
 * server, and there is no runtime where all five are truthfully obtainable:
 *
 *   - CPU load percentage has no portable API. `os.loadavg()` is Node-only, is
 *     a run-queue average rather than a percentage, and returns a hardcoded
 *     [0, 0, 0] on Windows -- which is where this project is developed. A zero
 *     that means "not measured" is indistinguishable from a zero that means
 *     "idle", so it is not reported at all.
 *   - Free disk needs `statfs`, which does not exist in a browser.
 *
 * Rather than fabricate them, the sampler reports the dimensions it actually
 * read and `describeResourceAvailability()` states which are obtainable here.
 * A dimension that could not be measured is absent, never present-and-zero.
 *
 * Browser safety: nothing here is imported statically from `node:*`. Node
 * globals are reached through feature detection on `process`, which is
 * undefined in the browser bundle and therefore simply skipped.
 */

import { telemetryClock } from "../utils/clock";

/** Which dimensions this runtime can actually produce. */
export interface ResourceAvailability {
  readonly heapUsedBytes: boolean;
  readonly heapTotalBytes: boolean;
  readonly rssBytes: boolean;
  /** Always false. See the module note. */
  readonly cpuLoadPercentage: boolean;
  /** Always false. See the module note. */
  readonly diskFreeBytes: boolean;
}

/** AKIRA-internal pressure the caller measures and hands in. */
export interface ApplicationPressure {
  readonly telemetryRecords?: number;
  readonly trackedComponents?: number;
  readonly trackedOperations?: number;
}

export interface ResourceSample {
  readonly takenAt: string;
  readonly heapUsedBytes?: number;
  readonly heapTotalBytes?: number;
  readonly rssBytes?: number;
  /** Never populated on any current runtime; kept so the shape matches the model. */
  readonly cpuLoadPercentage?: number;
  /** Never populated on any current runtime. */
  readonly diskFreeBytes?: number;
  /**
   * Flat gauge view of everything actually measured, keyed by metric name.
   * Only contains dimensions that produced a real reading.
   */
  readonly measurements: Readonly<Record<string, number>>;
}

interface NodeMemoryUsage {
  heapUsed?: number;
  heapTotal?: number;
  rss?: number;
}

/** Node's `process.memoryUsage`, if this runtime has it. */
function nodeMemoryUsage(): NodeMemoryUsage | undefined {
  const proc = (globalThis as { process?: { memoryUsage?: () => NodeMemoryUsage } }).process;
  if (proc && typeof proc.memoryUsage === "function") {
    try {
      return proc.memoryUsage();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Chrome's non-standard `performance.memory`, if present.
 *
 * Only usedJSHeapSize/totalJSHeapSize, and only in Chromium. Firefox and Safari
 * do not implement it, so browser heap readings are best-effort by nature.
 */
function browserHeap(): { used?: number; total?: number } | undefined {
  const perf = (globalThis as { performance?: { memory?: Record<string, number> } }).performance;
  const memory = perf?.memory;
  if (!memory) return undefined;
  return { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function describeResourceAvailability(): ResourceAvailability {
  const node = nodeMemoryUsage();
  const browser = browserHeap();

  return Object.freeze({
    heapUsedBytes: isFiniteNumber(node?.heapUsed) || isFiniteNumber(browser?.used),
    heapTotalBytes: isFiniteNumber(node?.heapTotal) || isFiniteNumber(browser?.total),
    rssBytes: isFiniteNumber(node?.rss),
    // Deliberate constants, asserted by the tests: see the module note.
    cpuLoadPercentage: false,
    diskFreeBytes: false,
  });
}

export class ResourceSampler {
  /**
   * Takes one reading.
   *
   * `pressure` carries AKIRA-internal numbers the caller already knows (store
   * occupancy, tracked component count). They are the only resource signal
   * available identically on both client and server, which makes them the more
   * useful half of this in practice.
   */
  sample(pressure?: ApplicationPressure): ResourceSample {
    const node = nodeMemoryUsage();
    const browser = browserHeap();
    const measurements: Record<string, number> = {};

    const heapUsed = isFiniteNumber(node?.heapUsed)
      ? node!.heapUsed
      : isFiniteNumber(browser?.used)
        ? browser!.used
        : undefined;

    const heapTotal = isFiniteNumber(node?.heapTotal)
      ? node!.heapTotal
      : isFiniteNumber(browser?.total)
        ? browser!.total
        : undefined;

    const rss = isFiniteNumber(node?.rss) ? node!.rss : undefined;

    if (heapUsed !== undefined) measurements["runtime.heap_used_bytes"] = heapUsed;
    if (heapTotal !== undefined) measurements["runtime.heap_total_bytes"] = heapTotal;
    if (rss !== undefined) measurements["runtime.rss_bytes"] = rss;

    if (isFiniteNumber(pressure?.telemetryRecords)) {
      measurements["akira.telemetry_records"] = pressure!.telemetryRecords!;
    }
    if (isFiniteNumber(pressure?.trackedComponents)) {
      measurements["akira.tracked_components"] = pressure!.trackedComponents!;
    }
    if (isFiniteNumber(pressure?.trackedOperations)) {
      measurements["akira.tracked_operations"] = pressure!.trackedOperations!;
    }

    return Object.freeze({
      takenAt: telemetryClock.nowIso(),
      heapUsedBytes: heapUsed,
      heapTotalBytes: heapTotal,
      rssBytes: rss,
      cpuLoadPercentage: undefined,
      diskFreeBytes: undefined,
      measurements: Object.freeze(measurements),
    });
  }
}

/** The sampler the composed production system reads from. */
export const resourceSampler = new ResourceSampler();
