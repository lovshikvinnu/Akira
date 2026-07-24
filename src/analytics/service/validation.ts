import { AnalyticsQueryOptions } from "./filters";
import { clockService } from "../shared/ClockService";

export interface ResolvedQuery {
  startDate: string; // ISO UTC string
  endDate: string; // ISO UTC string
  timezoneOffsetMinutes: number;
}

/**
 * Centralized validator for query parameters.
 * Resolves predefined ranges (today, yesterday, last7Days, last30Days) into UTC date strings
 * and validates boundaries and parameter types.
 */
export function validateAndResolveQuery(options: AnalyticsQueryOptions): ResolvedQuery {
  // 1. Resolve Timezone Offset
  let offset = 0;
  if (options.filters?.timezone !== undefined) {
    const tz = options.filters.timezone;
    if (typeof tz === "number") {
      offset = tz;
    } else {
      const parsed = parseInt(tz, 10);
      if (!isNaN(parsed)) {
        offset = parsed;
      } else {
        throw new Error(`Validation Error: Invalid timezone offset: ${tz}`);
      }
    }
  }

  // 2. Resolve Predefined Date Ranges
  let startStr = options.startDate;
  let endStr = options.endDate;

  const range = options.range || "custom";

  if (range !== "custom") {
    const now = clockService.now();

    // Calculate local midnight boundaries adjusted by timezone offset
    const localNow = new Date(now.getTime() + offset * 60 * 1000);
    const year = localNow.getUTCFullYear();
    const month = localNow.getUTCMonth();
    const date = localNow.getUTCDate();

    if (range === "today") {
      const localStart = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
      const localEnd = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));

      startStr = new Date(localStart.getTime() - offset * 60 * 1000).toISOString();
      endStr = new Date(localEnd.getTime() - offset * 60 * 1000).toISOString();
    } else if (range === "yesterday") {
      const localStart = new Date(Date.UTC(year, month, date - 1, 0, 0, 0, 0));
      const localEnd = new Date(Date.UTC(year, month, date - 1, 23, 59, 59, 999));

      startStr = new Date(localStart.getTime() - offset * 60 * 1000).toISOString();
      endStr = new Date(localEnd.getTime() - offset * 60 * 1000).toISOString();
    } else if (range === "last7Days") {
      const localStart = new Date(Date.UTC(year, month, date - 6, 0, 0, 0, 0));
      const localEnd = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));

      startStr = new Date(localStart.getTime() - offset * 60 * 1000).toISOString();
      endStr = new Date(localEnd.getTime() - offset * 60 * 1000).toISOString();
    } else if (range === "last30Days") {
      const localStart = new Date(Date.UTC(year, month, date - 29, 0, 0, 0, 0));
      const localEnd = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));

      startStr = new Date(localStart.getTime() - offset * 60 * 1000).toISOString();
      endStr = new Date(localEnd.getTime() - offset * 60 * 1000).toISOString();
    }
  }

  if (!startStr || !endStr) {
    throw new Error(
      "Validation Error: Query must specify startDate and endDate, or a predefined range",
    );
  }

  // 3. Validate Date Boundaries
  const startMs = Date.parse(startStr);
  const endMs = Date.parse(endStr);

  if (isNaN(startMs)) {
    throw new Error(`Validation Error: Invalid start date: ${startStr}`);
  }
  if (isNaN(endMs)) {
    throw new Error(`Validation Error: Invalid end date: ${endStr}`);
  }

  if (endMs < startMs) {
    throw new Error(
      `Validation Error: End date (${endStr}) cannot be before start date (${startStr})`,
    );
  }

  // Validate aggregation period if present
  if (options.filters?.aggregationPeriod) {
    const period = options.filters.aggregationPeriod;
    if (period !== "day" && period !== "week" && period !== "month") {
      throw new Error(`Validation Error: Unsupported aggregation period: ${period}`);
    }
  }

  return {
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endMs).toISOString(),
    timezoneOffsetMinutes: offset,
  };
}
