import {
  Metric,
  MetricType,
  MetricLabelSet,
  MetricMetadata,
  MetricSnapshot,
  Counter,
  Gauge,
  Histogram,
  Timer,
  ActiveTimer,
  HistogramData,
} from "./contracts";
import { MetricValidationError } from "./errors";
import { telemetryClock } from "../utils/clock";

export abstract class MetricBase implements Metric {
  public readonly metadata: MetricMetadata;

  constructor(
    public readonly name: string,
    public readonly type: MetricType,
    public readonly unit: string,
    public readonly labels: MetricLabelSet = {},
    description = "",
    category = "general",
    module = "default",
    version = "1.0.0",
  ) {
    this.metadata = Object.freeze({
      name,
      description,
      unit,
      type,
      category,
      module,
      labels: Object.freeze({ ...labels }),
      version,
      creationTime: telemetryClock.nowIso(),
    });
  }

  public abstract getSnapshot(): MetricSnapshot;
}

export class CounterImpl extends MetricBase implements Counter {
  public readonly type = "counter";
  private value = 0;

  public increment(value = 1): void {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      throw new MetricValidationError(`Counter increment value must be a valid number: ${value}`);
    }
    if (value < 0) {
      throw new MetricValidationError(`Counter increment value must be non-negative: ${value}`);
    }
    this.value += value;
  }

  public getValue(): number {
    return this.value;
  }

  public reset(): void {
    this.value = 0;
  }

  public getSnapshot(): MetricSnapshot {
    return {
      metadata: this.metadata,
      value: this.value,
      timestamp: telemetryClock.nowIso(),
    };
  }
}

export class GaugeImpl extends MetricBase implements Gauge {
  public readonly type = "gauge";
  private value = 0;

  public set(value: number): void {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      throw new MetricValidationError(`Gauge set value must be a valid finite number: ${value}`);
    }
    this.value = value;
  }

  public increase(value = 1): void {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      throw new MetricValidationError(
        `Gauge increase value must be a valid finite number: ${value}`,
      );
    }
    this.value += value;
  }

  public decrease(value = 1): void {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      throw new MetricValidationError(
        `Gauge decrease value must be a valid finite number: ${value}`,
      );
    }
    this.value -= value;
  }

  public getValue(): number {
    return this.value;
  }

  public getSnapshot(): MetricSnapshot {
    return {
      metadata: this.metadata,
      value: this.value,
      timestamp: telemetryClock.nowIso(),
    };
  }
}

export class HistogramImpl extends MetricBase implements Histogram {
  public readonly type = "histogram";
  private count = 0;
  private sum = 0;
  private min = Infinity;
  private max = -Infinity;

  private readonly rawValues: number[] = [];
  private readonly buckets: number[];
  private readonly bucketCounts: number[];

  constructor(
    name: string,
    unit: string,
    labels: MetricLabelSet = {},
    description = "",
    category = "general",
    module = "default",
    version = "1.0.0",
    customBuckets?: number[],
  ) {
    super(name, "histogram", unit, labels, description, category, module, version);
    this.buckets = customBuckets || [
      0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
    ];
    this.buckets.sort((a, b) => a - b);
    this.bucketCounts = new Array(this.buckets.length + 1).fill(0);
  }

  public record(value: number): void {
    if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
      throw new MetricValidationError(`Histogram value must be a valid finite number: ${value}`);
    }

    this.rawValues.push(value);
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;

    // Track buckets for snapshot distribution representation
    let idx = 0;
    const len = this.buckets.length;
    while (idx < len && value > this.buckets[idx]) {
      idx++;
    }
    this.bucketCounts[idx]++;
  }

  public getPercentile(percentile: number): number {
    if (percentile <= 0 || percentile >= 100) {
      throw new MetricValidationError(
        `Percentile must be between 0 and 100 (exclusive): ${percentile}`,
      );
    }

    if (this.count === 0) {
      return 0;
    }

    // Exact percentile calculation (sorting raw values)
    const sorted = [...this.rawValues].sort((a, b) => a - b);
    const targetIdx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
    );
    return sorted[targetIdx];
  }

  public getHistogramData(): HistogramData {
    const bucketsMap = new Map<number, number>();
    for (let i = 0; i < this.buckets.length; i++) {
      bucketsMap.set(this.buckets[i], this.bucketCounts[i]);
    }
    bucketsMap.set(Infinity, this.bucketCounts[this.buckets.length]);

    const average = this.count === 0 ? 0 : this.sum / this.count;

    return {
      count: this.count,
      sum: this.sum,
      min: this.count === 0 ? 0 : this.min,
      max: this.count === 0 ? 0 : this.max,
      average,
      p50: this.getPercentile(50),
      p90: this.getPercentile(90),
      p95: this.getPercentile(95),
      p99: this.getPercentile(99),
      buckets: Object.freeze(bucketsMap),
    };
  }

  public getSnapshot(): MetricSnapshot {
    return {
      metadata: this.metadata,
      value: this.getHistogramData(),
      timestamp: telemetryClock.nowIso(),
    };
  }
}

export class TimerImpl extends MetricBase implements Timer {
  public readonly type = "histogram";
  private readonly histogram: HistogramImpl;

  constructor(
    name: string,
    unit: string,
    labels: MetricLabelSet = {},
    description = "",
    category = "general",
    module = "default",
    version = "1.0.0",
    customBuckets?: number[],
  ) {
    super(name, "histogram", unit, labels, description, category, module, version);
    this.histogram = new HistogramImpl(
      name,
      unit,
      labels,
      description,
      category,
      module,
      version,
      customBuckets,
    );
  }

  public start(): ActiveTimer {
    const start = telemetryClock.monotonicNow();
    return {
      stop: () => {
        const duration = telemetryClock.elapsedMs(start, telemetryClock.monotonicNow());
        this.record(duration);
        return duration;
      },
    };
  }

  public record(value: number): void {
    this.histogram.record(value);
  }

  public getAverage(): number {
    return this.histogram.getHistogramData().average;
  }

  public getMin(): number {
    return this.histogram.getHistogramData().min;
  }

  public getMax(): number {
    return this.histogram.getHistogramData().max;
  }

  public getSnapshot(): MetricSnapshot {
    return this.histogram.getSnapshot();
  }
}
