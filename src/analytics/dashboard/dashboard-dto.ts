import {
  DashboardSummaryDTO,
  ProductivitySummaryDTO,
  ProjectHealthDTO,
  SearchInsightsDTO,
  SessionStatisticsDTO,
  ActivityTimelineDTO,
} from "../service/dto";
import {
  ProductivityWidget,
  ActivityWidget,
  ProjectWidget,
  VaultWidget,
  SearchWidget,
  SessionWidget,
} from "./dashboard-widgets";

export interface DashboardDTO {
  summary: DashboardSummaryDTO;
  productivity: ProductivitySummaryDTO;
  activity: ActivityTimelineDTO;
  projects: {
    activeProjects: string[];
    dormantProjects: string[];
    projectDetails: ProjectHealthDTO[];
  };
  vault: {
    storageActivity: number;
    uploadHistory: { date: string; filesUploaded: number; sizeBytes: number }[];
  };
  search: SearchInsightsDTO;
  sessions: SessionStatisticsDTO;
  widgets: {
    productivity: ProductivityWidget;
    activity: ActivityWidget;
    projects: ProjectWidget;
    vault: VaultWidget;
    search: SearchWidget;
    sessions: SessionWidget;
  };
}
