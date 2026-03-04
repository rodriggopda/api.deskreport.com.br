import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getSummary(organizationId: string) {
        const [totalProjects, tasks] = await Promise.all([
            this.prisma.project.count({
                where: { organizationId, status: 'active' },
            }),
            this.prisma.task.findMany({
                where: { companyId: organizationId },
                select: { status: true, dueDate: true }
            }),
        ]);

        const totalTasks = tasks.length;
        const pendingTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'completed').length;

        const now = new Date();
        const overdueTasks = tasks.filter(t => {
            if (t.status === 'done' || t.status === 'completed' || !t.dueDate) return false;
            return new Date(t.dueDate) < now;
        }).length;

        const activeMembers = await this.prisma.member.count({
            where: { organizationId }
        });

        return {
            total_projects: totalProjects,
            total_tasks: totalTasks,
            pending_tasks: pendingTasks,
            overdue_tasks: overdueTasks,
            active_members: activeMembers,
        };
    }

    async getWorkload(organizationId: string) {
        const members = await this.prisma.member.findMany({
            where: { organizationId },
            include: {
                user: {
                    include: {
                        _count: {
                            select: {
                                assignedTasks: {
                                    where: {
                                        companyId: organizationId,
                                        status: { notIn: ['done', 'completed'] }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        return members.map(member => {
            return {
                user_id: member.userId,
                name: member.user.name,
                email: member.user.email,
                active_tasks_count: (member.user as any)._count?.assignedTasks || 0,
            };
        });
    }

    async getUpcomingDeadlines(organizationId: string) {
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        return this.prisma.task.findMany({
            where: {
                companyId: organizationId,
                status: { notIn: ['done', 'completed'] },
                dueDate: {
                    gte: now,
                    lte: nextWeek
                }
            },
            orderBy: { dueDate: 'asc' },
            take: 10,
            include: { assignees: { select: { id: true, name: true, image: true } } }
        });
    }

    async getProjectHealth(organizationId: string) {
        const projects = await this.prisma.project.findMany({
            where: { organizationId },
        });

        const tasksStats = await this.prisma.task.groupBy({
            by: ['project', 'status'],
            where: { companyId: organizationId },
            _count: { id: true },
        });

        return projects.map((project) => {
            const projectTasks = tasksStats.filter((t) => t.project === project.id);
            const totalTasks = projectTasks.reduce((acc, curr) => acc + curr._count.id, 0);
            const completedTasks = projectTasks
                .filter((t) => t.status === 'done' || t.status === 'completed')
                .reduce((acc, curr) => acc + curr._count.id, 0);

            const completionPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

            let statusHealth = 'on_track'; // on_track, at_risk, delayed
            if (completionPercentage < 50 && project.endDate && new Date(project.endDate) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
                statusHealth = 'at_risk';
            }
            if (project.endDate && new Date(project.endDate) < new Date() && completionPercentage < 100) {
                statusHealth = 'delayed';
            }

            return {
                id: project.id,
                name: project.name,
                status: statusHealth,
                completion_percentage: completionPercentage,
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
            };
        });
    }

    async getTaskTrends(organizationId: string) {
        const now = new Date();
        const past7Days = Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(now);
            d.setDate(d.getDate() - (6 - i));
            d.setHours(0, 0, 0, 0);
            return d;
        });

        const startOfPeriod = past7Days[0];

        // Fetch tasks created in the last 7 days
        const recentTasks = await this.prisma.task.findMany({
            where: {
                companyId: organizationId,
                OR: [
                    { createdAt: { gte: startOfPeriod } },
                    { updatedAt: { gte: startOfPeriod }, status: { in: ['done', 'completed'] } }
                ]
            },
            select: { createdAt: true, updatedAt: true, status: true }
        });

        return past7Days.map((date) => {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            const created = recentTasks.filter(t => t.createdAt >= date && t.createdAt < nextDay).length;
            const completed = recentTasks.filter(t =>
                (t.status === 'done' || t.status === 'completed') &&
                t.updatedAt >= date && t.updatedAt < nextDay
            ).length;

            return {
                date: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
                created,
                completed
            };
        });
    }
}
