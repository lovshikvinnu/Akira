import { TelemetryRecord } from "../contracts/telemetry";

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricLabelSet {
  readonly [key: string]: string;
}

export interface MetricMetadata {
  readonly name: string;
  readonly description: string;
  readonly unit: string;
  readonly type: MetricType;
  readonly category: string;
  readonly module: string;
  readonly labels: MetricLabelSet;
  readonly version: string;
  readonly creationTime: string;
}

export interface HistogramData {
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly average: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly buckets: ReadonlyMap<number, number>;
}

export interface MetricSnapshot {
  readonly metadata: MetricMetadata;
  readonly value: number | HistogramData;
  readonly timestamp: string;
}

export interface Metric {
  readonly metadata: MetricMetadata;
  readonly name: string;
  readonly type: MetricType;
  readonly unit: string;
  readonly labels: MetricLabelSet;
  getSnapshot(): MetricSnapshot;
}

export interface Counter extends Metric {
  increment(value?: number): void;
  getValue(): number;
  reset(): void;
}

export interface Gauge extends Metric {
  set(value: number): void;
  increase(value?: number): void;
  decrease(value?: number): void;
  getValue(): number;
}

export interface Histogram extends Metric {
  record(value: number): void;
  getPercentile(percentile: number): number;
  getHistogramData(): HistogramData;
}

export interface ActiveTimer {
  stop(): number;
}

export interface Timer extends Metric {
  start(): ActiveTimer;
  record(value: number): void;
  getAverage(): number;
  getMin(): number;
  getMax(): number;
}

export interface MetricRegistry {
  register(metric: Metric): void;
  unregister(name: string, labels?: MetricLabelSet): void;
  find(name: string, labels?: MetricLabelSet): Metric | undefined;
  list(): Metric[];
  exists(name: string, labels?: MetricLabelSet): boolean;

  // Convenient Factory & Registration API
  counter(
    name: string,
    unit: string,
    labels?: MetricLabelSet,
    metadata?: Partial<MetricMetadata>,
  ): Counter;
  gauge(
    name: string,
    unit: string,
    labels?: MetricLabelSet,
    metadata?: Partial<MetricMetadata>,
  ): Gauge;
  histogram(
    name: string,
    unit: string,
    labels?: MetricLabelSet,
    metadata?: Partial<MetricMetadata>,
    customBuckets?: number[],
  ): Histogram;
  timer(
    name: string,
    unit: string,
    labels?: MetricLabelSet,
    metadata?: Partial<MetricMetadata>,
  ): Timer;

  // Recording & Pipeline Integration
  record(record: TelemetryRecord): Promise<void>;
  snapshot(): MetricSnapshot[];
  clear(): void;
}
