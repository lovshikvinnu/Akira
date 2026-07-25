import {
  MetricRegistry,
  Metric,
  MetricLabelSet,
  MetricSnapshot,
  Counter,
  Gauge,
  Histogram,
  Timer,
  MetricMetadata,
} from "./contracts";
import { MetricRegistrationError, MetricValidationError } from "./errors";
import { CounterImpl, GaugeImpl, HistogramImpl, TimerImpl } from "./types";
import { TelemetryRecord } from "../contracts/telemetry";
import { telemetryService } from "../services/telemetry-service";

export class SimpleMetricRegistry implements MetricRegistry {
  private readonly metrics = new Map<string, Metric>();
  private readonly NAME_VALIDATOR = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
  private readonly RESERVED_PREFIX = /^akira\./i;
  private readonly RESERVED_KEYWORDS = new Set(["akira", "system", "all"]);

  private getMetricKey(name: string, labels: MetricLabelSet = {}): string {
    const keys = Object.keys(labels).sort();
    const labelParts = keys.map((k) => `${k}=${labels[k]}`);
    return `${name}{${labelParts.join(",")}}`;
  }

  private validateName(name: string): void {
    if (!name || typeof name !== "string") {
      throw new MetricValidationError("Metric name must be a non-empty string");
    }
    if (!this.NAME_VALIDATOR.test(name)) {
      throw new MetricValidationError(`Metric name contains illegal characters: ${name}`);
    }
    if (this.RESERVED_PREFIX.test(name) || this.RESERVED_KEYWORDS.has(name.toLowerCase())) {
      throw new MetricValidationError(`Metric name uses a reserved prefix or keyword: ${name}`);
    }
  }

  private validateLabels(labels: MetricLabelSet): void {
    for (const key of Object.keys(labels)) {
      if (!this.NAME_VALIDATOR.test(key)) {
        throw new MetricValidationError(`Metric label key contains illegal characters: ${key}`);
      }
      const val = labels[key];
      if (typeof val !== "string") {
        throw new MetricValidationError(`Metric label value for key '${key}' must be a string`);
      }
    }
  }

  private validateUnit(unit: string): void {
    if (!unit || typeof unit !== "string" || unit.trim() === "") {
      throw new MetricValidationError("Metric unit must be a non-empty string");
    }
  }

  public register(metric: Metric): void {
    this.validateName(metric.name);
    this.validateLabels(metric.labels);
    this.validateUnit(metric.unit);

    const key = this.getMetricKey(metric.name, metric.labels);
    const existing = this.metrics.get(key);

    if (existing) {
      if (existing.type !== metric.type) {
        throw new MetricRegistrationError(
          `Metric '${metric.name}' already registered with a different type: ${existing.type}`,
        );
      }
      return;
    }

    this.metrics.set(key, metric);
  }

  public unregister(name: string, labels: MetricLabelSet = {}): void {
    const key = this.getMetricKey(name, labels);
    this.metrics.delete(key);
  }

  public find(name: string, labels: MetricLabelSet = {}): Metric | undefined {
    const key = this.getMetricKey(name, labels);
    return this.metrics.get(key);
  }

  public list(): Metric[] {
    return Array.from(this.metrics.values());
  }

  public exists(name: string, labels: MetricLabelSet = {}): boolean {
    const key = this.getMetricKey(name, labels);
    return this.metrics.has(key);
  }

  // Convenient Factory & Registration API
  public counter(
    name: string,
    unit: string,
    labels: MetricLabelSet = {},
    metadata?: Partial<MetricMetadata>,
  ): Counter {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing) {
      if (existing.type !== "counter") {
        throw new MetricRegistrationError(
          `Metric '${name}' already registered with a different type: ${existing.type}`,
        );
      }
      return existing as Counter;
    }

    const description = metadata?.description || "";
    const category = metadata?.category || "general";
    const module = metadata?.module || "default";
    const version = metadata?.version || "1.0.0";

    const counter = new CounterImpl(
      name,
      "counter",
      unit,
      labels,
      description,
      category,
      module,
      version,
    );
    this.register(counter);
    return counter;
  }

  public gauge(
    name: string,
    unit: string,
    labels: MetricLabelSet = {},
    metadata?: Partial<MetricMetadata>,
  ): Gauge {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing) {
      if (existing.type !== "gauge") {
        throw new MetricRegistrationError(
          `Metric '${name}' already registered with a different type: ${existing.type}`,
        );
      }
      return existing as Gauge;
    }

    const description = metadata?.description || "";
    const category = metadata?.category || "general";
    const module = metadata?.module || "default";
    const version = metadata?.version || "1.0.0";

    const gauge = new GaugeImpl(
      name,
      "gauge",
      unit,
      labels,
      description,
      category,
      module,
      version,
    );
    this.register(gauge);
    return gauge;
  }

  public histogram(
    name: string,
    unit: string,
    labels: MetricLabelSet = {},
    metadata?: Partial<MetricMetadata>,
    customBuckets?: number[],
  ): Histogram {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing) {
      if (existing.type !== "histogram") {
        throw new MetricRegistrationError(
          `Metric '${name}' already registered with a different type: ${existing.type}`,
        );
      }
      return existing as Histogram;
    }

    const description = metadata?.description || "";
    const category = metadata?.category || "general";
    const module = metadata?.module || "default";
    const version = metadata?.version || "1.0.0";

    const histogram = new HistogramImpl(
      name,
      unit,
      labels,
      description,
      category,
      module,
      version,
      customBuckets,
    );
    this.register(histogram);
    return histogram;
  }

  public timer(
    name: string,
    unit: string,
    labels: MetricLabelSet = {},
    metadata?: Partial<MetricMetadata>,
  ): Timer {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing) {
      if (existing.type !== "histogram") {
        throw new MetricRegistrationError(
          `Metric '${name}' already registered with a different type: ${existing.type}`,
        );
      }
      return existing as Timer;
    }

    const description = metadata?.description || "";
    const category = metadata?.category || "general";
    const module = metadata?.module || "default";
    const version = metadata?.version || "1.0.0";

    const timer = new TimerImpl(name, unit, labels, description, category, module, version);
    this.register(timer);
    return timer;
  }

  // Recording & Pipeline Integration
  public async record(record: TelemetryRecord): Promise<void> {
    await telemetryService.record(record);
  }

  public snapshot(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];
    for (const metric of this.metrics.values()) {
      snapshots.push(metric.getSnapshot());
    }
    return snapshots;
  }

  public clear(): void {
    this.metrics.clear();
  }
}

export const metricRegistry = new SimpleMetricRegistry();
