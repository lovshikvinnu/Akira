export interface AnalyticsQueryFilters {
  projectId?: string;
  eventType?: string;
  module?: string; // mapping to event source
  timezone?: string | number; // timezone offset in minutes (e.g. "+330" or -300)
  aggregationPeriod?: "day" | "week" | "month";
}

export type PredefinedDateRange = "today" | "yesterday" | "last7Days" | "last30Days" | "custom";

export interface AnalyticsQueryOptions {
  range?: PredefinedDateRange;
  startDate?: string; // YYYY-MM-DD or ISO
  endDate?: string; // YYYY-MM-DD or ISO
  filters?: AnalyticsQueryFilters;
}
