import { Controller, Post, Body, Param, Get, Query, UnauthorizedException } from '@nestjs/common';
import { GithubService } from './github.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('github')
export class GithubController {
    constructor(private githubService: GithubService) { }

    @Get('integration/:projectId')
    async getIntegration(@Param('projectId') projectId: string) {
        return this.githubService.getIntegration(projectId);
    }

    @Post('integration/:projectId')
    async saveIntegration(@Param('projectId') projectId: string, @Body() data: any) {
        return this.githubService.saveIntegration(projectId, data);
    }

    @Post('test')
    async testConnection(@Body('accessToken') accessToken: string) {
        return this.githubService.testConnection(accessToken);
    }

    @Post('sync/:projectId')
    async syncIssues(@Param('projectId') projectId: string, @ActiveOrg() organizationId: string) {
        return this.githubService.syncIssues(projectId, organizationId);
    }
}
