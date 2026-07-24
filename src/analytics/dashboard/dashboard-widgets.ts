export interface ProductivityWidget {
  title: string;
  score: number;
  trend: { date: string; productivityScore: number }[];
  delta: number; // Difference in productivity score compared to previous period
}

export interface ActivityWidget {
  activeDays: number;
  streak: number;
  peakHour: number;
}

export interface ProjectWidget {
  activeProjects: number;
  dormantProjects: number;
  topProjects: { projectId: string; activityScore: number }[];
}

export interface VaultWidget {
  uploadedFiles: number;
  uploadedBytes: number;
}

export interface SearchWidget {
  searches: number;
  topQueries: { query: string; count: number }[];
}

export interface SessionWidget {
  sessions: number;
  averageDuration: number; // formatted or in seconds
}
