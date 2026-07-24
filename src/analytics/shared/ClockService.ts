export class ClockService {
  /**
   * Retrieves the current system date/time.
   */
  now(): Date {
    return new Date();
  }

  /**
   * Adjusts a given timestamp for a timezone offset (in minutes) and extracts the daily, weekly, or monthly bucket key.
   * @param date The timestamp (Date or ISO string or ms)
   * @param offsetMinutes Timezone offset in minutes (e.g., -300 for EST, +330 for IST)
   * @param unit 'day' | 'week' | 'month'
   */
  getBucketKey(
    date: Date | string | number,
    offsetMinutes: number,
    unit: "day" | "week" | "month",
  ): string {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid date passed to getBucketKey: ${date}`);
    }

    // Adjust by offset (offsetMinutes is in minutes, e.g., +330 or -300)
    const localTime = new Date(d.getTime() + offsetMinutes * 60 * 1000);

    const year = localTime.getUTCFullYear();
    const month = String(localTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(localTime.getUTCDate()).padStart(2, "0");

    if (unit === "day") {
      return `${year}-${month}-${day}`;
    }

    if (unit === "month") {
      return `${year}-${month}`;
    }

    if (unit === "week") {
      // Standardize week key on the Monday starting the week
      const utcDay = localTime.getUTCDay(); // Sunday = 0, Monday = 1...
      const diff = localTime.getUTCDate() - utcDay + (utcDay === 0 ? -6 : 1);
      const startOfWeek = new Date(Date.UTC(year, localTime.getUTCMonth(), diff));

      const wYear = startOfWeek.getUTCFullYear();
      const wMonth = String(startOfWeek.getUTCMonth() + 1).padStart(2, "0");
      const wDay = String(startOfWeek.getUTCDate()).padStart(2, "0");
      return `${wYear}-${wMonth}-${wDay}`;
    }

    throw new Error(`Unsupported aggregation unit: ${unit}`);
  }
}

export const clockService = new ClockService();
