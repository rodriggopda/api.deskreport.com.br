import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('summary')
    getSummary(@ActiveOrg() orgId: string) {
        return this.dashboardService.getSummary(orgId);
    }

    @Get('workload')
    getWorkload(@ActiveOrg() orgId: string) {
        return this.dashboardService.getWorkload(orgId);
    }

    @Get('upcoming-deadlines')
    getUpcomingDeadlines(@ActiveOrg() orgId: string) {
        return this.dashboardService.getUpcomingDeadlines(orgId);
    }

    @Get('project-health')
    getProjectHealth(@ActiveOrg() orgId: string) {
        return this.dashboardService.getProjectHealth(orgId);
    }

    @Get('task-trends')
    getTaskTrends(@ActiveOrg() orgId: string) {
        return this.dashboardService.getTaskTrends(orgId);
    }
}
