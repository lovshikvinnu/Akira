import { analyticsService, AnalyticsService } from "../service/analytics-service";
import { DashboardBuilder } from "./dashboard-builder";
import { AnalyticsQueryOptions } from "../service/filters";
import { DashboardDTO } from "./dashboard-dto";

export class DashboardService {
  private builder: DashboardBuilder;

  constructor(private service: AnalyticsService = analyticsService) {
    this.builder = new DashboardBuilder(service);
  }

  /**
   * Main dashboard fetch endpoint.
   * Clears the request-scoped query cache to fetch fresh records,
   * then builds the complete DashboardDTO.
   */
  getDashboard(options?: AnalyticsQueryOptions): DashboardDTO {
    this.service.clearCache();

    return this.builder.build(options);
  }
}

export const dashboardService = new DashboardService();
