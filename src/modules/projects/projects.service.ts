import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateProjectDto {
    name: string;
    description?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    status?: string;
    teamIds?: string[];
}

@Injectable()
export class ProjectsService {
    constructor(private prisma: PrismaService) { }

    async create(organizationId: string, { teamIds, ...data }: CreateProjectDto) {
        return this.prisma.project.create({
            data: {
                organizationId,
                ...data,
                teams: teamIds ? {
                    create: teamIds.map(teamId => ({ teamId }))
                } : undefined
            },
            include: {
                teams: {
                    include: {
                        team: true
                    }
                }
            }
        });
    }

    async findAll(organizationId: string) {
        const projects = await this.prisma.project.findMany({
            where: { organizationId },
            include: {
                teams: {
                    include: {
                        team: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
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

            return {
                ...project,
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
                completion_percentage: completionPercentage,
            };
        });
    }

    async findOne(id: string, organizationId: string) {
        return this.prisma.project.findFirst({
            where: { id, organizationId },
            include: {
                teams: {
                    include: {
                        team: true
                    }
                }
            }
        });
    }

    async update(id: string, organizationId: string, { teamIds, ...data }: Partial<CreateProjectDto>) {
        if (teamIds) {
            // Reset teams
            await this.prisma.projectTeam.deleteMany({
                where: { projectId: id }
            });

            // Add new teams
            if (teamIds.length > 0) {
                await this.prisma.projectTeam.createMany({
                    data: teamIds.map(teamId => ({
                        projectId: id,
                        teamId
                    }))
                });
            }
        }

        await this.prisma.project.update({
            where: { id },
            data,
        });

        return this.findOne(id, organizationId);
    }

    async remove(id: string, organizationId: string) {
        return this.prisma.project.deleteMany({
            where: { id, organizationId },
        });
    }
}
