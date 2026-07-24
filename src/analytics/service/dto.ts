export interface DashboardSummaryDTO {
  productivityScore: number;
  tasksCompleted: number;
  activeProjects: number;
  sessionDuration: number; // in seconds
  storageActivity: number; // in bytes
  dailyEvents: number;
}

export interface ProductivitySummaryDTO {
  completionRate: number;
  tasksCreated: number;
  tasksCompleted: number;
  reopenedTasks: number;
  productivityScore: number;
}

export interface ProjectHealthDTO {
  projectId: string;
  activityScore: number;
  completionPercentage: number;
  lastActivity: string;
  dormant: boolean;
}

export interface SearchInsightsDTO {
  searchesExecuted: number;
  repeatedSearches: number;
  mostCommonQueries: { query: string; count: number }[];
}

export interface SessionStatisticsDTO {
  sessionCount: number;
  totalDuration: number;
  averageDuration: number;
  longestSession: number;
}

export interface ActivityTimelineDTO {
  activeDays: number;
  activityStreak: number;
  peakActivityHour: number;
  timeline: { date: string; eventCount: number }[];
}
