import { Controller, Post, Body, Param, Get, Query, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { GithubService } from './github.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('github')
export class GithubController {
    constructor(private githubService: GithubService) { }

    @Get('auth-url/:projectId')
    getAuthUrl(@Param('projectId') projectId: string) {
        return { url: this.githubService.getAuthUrl(projectId) };
    }

    @Post('callback')
    async handleCallback(@Body('code') code: string, @Body('projectId') projectId: string) {
        const accessToken = await this.githubService.exchangeCode(code);
        // Save minimal integration first
        await this.githubService.saveIntegration(projectId, {
            accessToken,
            githubOwner: '', // will be updated later
        });

        const repos = await this.githubService.getUserRepos(accessToken);
        return { accessToken, repos };
    }

    @Get('repos/:projectId')
    async getRepos(@Param('projectId') projectId: string) {
        const integration = await this.githubService.getIntegration(projectId);
        if (!integration) throw new NotFoundException('Project not connected to GitHub');
        return this.githubService.getUserRepos(integration.accessToken);
    }

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
