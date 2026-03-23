import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Octokit } from 'octokit';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GithubService {
    constructor(
        private prisma: PrismaService,
        private config: ConfigService
    ) { }

    private readonly clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    private readonly clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET');
    private readonly redirectUri = this.config.get<string>('GITHUB_REDIRECT_URI');

    getAuthUrl(projectId: string) {
        const scopes = ['repo', 'project'].join(' ');
        return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&scope=${scopes}&state=${projectId}`;
    }

    async exchangeCode(code: string) {
        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code,
        }, {
            headers: { Accept: 'application/json' }
        });

        if (response.data.error) {
            throw new Error(response.data.error_description || response.data.error);
        }

        return response.data.access_token;
    }

    async getUserRepos(accessToken: string) {
        const octokit = new Octokit({ auth: accessToken });
        const { data } = await octokit.rest.repos.listForAuthenticatedUser({
            sort: 'updated',
            per_page: 100
        });
        return data.map(repo => ({
            id: repo.id,
            name: repo.name,
            owner: repo.owner.login,
            fullName: repo.full_name
        }));
    }

    async getIntegration(projectId: string) {
        return this.prisma.gitHubIntegration.findUnique({
            where: { projectId },
        });
    }

    async saveIntegration(projectId: string, data: any) {
        const { id, ...rest } = data;
        return this.prisma.gitHubIntegration.upsert({
            where: { projectId },
            create: {
                ...rest,
                projectId,
            },
            update: rest,
        });
    }

    async testConnection(accessToken: string) {
        const octokit = new Octokit({ auth: accessToken });
        try {
            const { data } = await octokit.rest.users.getAuthenticated();
            return { success: true, user: data.login };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async syncIssues(projectId: string, organizationId: string) {
        const integration = await this.getIntegration(projectId);

        const reposToSync = [];
        if (integration?.repos && Array.isArray(integration.repos)) {
            reposToSync.push(...integration.repos as any[]);
        } else if (integration?.githubOwner && integration?.githubRepo) {
            // Backwards compatibility
            reposToSync.push({ owner: integration.githubOwner, repo: integration.githubRepo });
        }

        if (reposToSync.length === 0) {
            throw new NotFoundException('No GitHub repositories configured for this project');
        }

        const octokit = new Octokit({ auth: integration.accessToken });
        const syncedTasksCount = { total: 0 };

        for (const repoInfo of reposToSync) {
            const { owner, repo } = repoInfo;
            if (!owner || !repo) continue;

            try {
                // Fetch issues
                const { data: issues } = await octokit.rest.issues.listForRepo({
                    owner,
                    repo,
                    state: 'all',
                    per_page: 100,
                });

                for (const issue of issues) {
                    if (issue.pull_request) continue;

                    const externalId = issue.id.toString();

                    const existingTask = await this.prisma.task.findFirst({
                        where: {
                            companyId: organizationId,
                            externalId,
                            source: 'github'
                        }
                    });

                    const taskData = {
                        title: issue.title,
                        description: issue.body || '',
                        status: this.mapGithubStatus(issue.state, issue.labels),
                        priority: this.mapGithubPriority(issue.labels),
                        project: projectId,
                        companyId: organizationId,
                        source: 'github',
                        externalId,
                    };

                    if (existingTask) {
                        await this.prisma.task.update({
                            where: { id: existingTask.id },
                            data: taskData,
                        });
                    } else {
                        const lastTask = await this.prisma.task.findFirst({
                            where: { companyId: organizationId },
                            orderBy: { shortId: 'desc' },
                        });
                        const shortId = lastTask ? lastTask.shortId + 1 : 1;

                        await this.prisma.task.create({
                            data: {
                                ...taskData,
                                shortId,
                            }
                        });
                    }
                    syncedTasksCount.total++;
                }
            } catch (err) {
                console.error(`Failed to sync issues for ${owner}/${repo}:`, err.message);
            }
        }

        return { count: syncedTasksCount.total };
    }

    private mapGithubStatus(state: string, labels: any[]): string {
        if (state === 'closed') return 'done';

        // Check labels for "in progress" etc
        const labelNames = labels.map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
        if (labelNames.includes('in progress')) return 'in_progress';
        if (labelNames.includes('todo')) return 'todo';
        if (labelNames.includes('backlog')) return 'backlog';

        return 'todo';
    }

    private mapGithubPriority(labels: any[]): string {
        const labelNames = labels.map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
        if (labelNames.includes('high') || labelNames.includes('p0') || labelNames.includes('priority: high')) return 'high';
        if (labelNames.includes('urgent')) return 'urgent';
        if (labelNames.includes('low') || labelNames.includes('p2') || labelNames.includes('priority: low')) return 'low';

        return 'medium';
    }
}
