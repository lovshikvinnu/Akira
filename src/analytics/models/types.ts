export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  tasksCompleted: number;
  tasksCreated: number;
  notesCreated: number;
  filesUploaded: number;
  searches: number;
  sessionDuration: number; // in seconds
  activeProjects: number;
}

export interface ProjectMetrics {
  projectId: string;
  activityScore: number;
  completionRate: number;
  lastActivity: string; // ISO 8601 Timestamp
}

export interface HistoricalAggregates {
  totalTasksCompleted: number;
  totalTasksCreated: number;
  totalNotesCreated: number;
  totalFilesUploaded: number;
  totalSearches: number;
  totalSessionDuration: number;
  averageActiveProjects: number;
}
