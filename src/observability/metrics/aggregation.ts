export interface MetricDataPoint {
  readonly value: number;
  readonly timestamp: string;
}

export class MetricAggregator {
  public static count(points: MetricDataPoint[]): number {
    return points.length;
  }

  public static sum(points: MetricDataPoint[]): number {
    return points.reduce((acc, p) => acc + p.value, 0);
  }

  public static average(points: MetricDataPoint[]): number {
    if (points.length === 0) return 0;
    return this.sum(points) / points.length;
  }

  public static minimum(points: MetricDataPoint[]): number {
    if (points.length === 0) return 0;
    return Math.min(...points.map((p) => p.value));
  }

  public static maximum(points: MetricDataPoint[]): number {
    if (points.length === 0) return 0;
    return Math.max(...points.map((p) => p.value));
  }

  public static latest(points: MetricDataPoint[]): number {
    if (points.length === 0) return 0;
    const sorted = [...points].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return sorted[0].value;
  }

  /**
   * Calculates rate: change in value per second between the earliest and latest data points.
   */
  public static rate(points: MetricDataPoint[]): number {
    if (points.length < 2) return 0;
    const sorted = [...points].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const durationSec =
      (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) / 1000;
    if (durationSec <= 0) return 0;
    return (end.value - start.value) / durationSec;
  }

  /**
   * Computes a simple moving average of size N for the points sorted chronologically by timestamp.
   */
  public static movingAverage(points: MetricDataPoint[], windowSize: number): number[] {
    if (points.length === 0 || windowSize <= 0) return [];
    const sorted = [...points].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const result: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = Math.max(0, i - windowSize + 1);
      const windowPoints = sorted.slice(windowStart, i + 1);
      const sum = windowPoints.reduce((acc, p) => acc + p.value, 0);
      result.push(sum / windowPoints.length);
    }
    return result;
  }
}
