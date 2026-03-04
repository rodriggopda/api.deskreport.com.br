import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Octokit } from 'octokit';

@Injectable()
export class GithubService {
    constructor(private prisma: PrismaService) { }

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
        if (!integration || !integration.githubOwner || !integration.githubRepo) {
            throw new NotFoundException('GitHub integration not configured correctly for this project');
        }

        const octokit = new Octokit({ auth: integration.accessToken });

        // Fetch issues (only open ones for now)
        const { data: issues } = await octokit.rest.issues.listForRepo({
            owner: integration.githubOwner,
            repo: integration.githubRepo,
            state: 'all',
            per_page: 100,
        });

        const syncedTasks = [];

        for (const issue of issues) {
            // Skip pull requests
            if (issue.pull_request) continue;

            const externalId = issue.id.toString();

            // Check if task already exists
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
                const updated = await this.prisma.task.update({
                    where: { id: existingTask.id },
                    data: taskData,
                });
                syncedTasks.push(updated);
            } else {
                // We need a shortId logic
                const lastTask = await this.prisma.task.findFirst({
                    where: { companyId: organizationId },
                    orderBy: { shortId: 'desc' },
                });
                const shortId = lastTask ? lastTask.shortId + 1 : 1;

                const created = await this.prisma.task.create({
                    data: {
                        ...taskData,
                        shortId,
                    }
                });
                syncedTasks.push(created);
            }
        }

        return { count: syncedTasks.length };
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
