import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateProjectDto {
    name: string;
    description?: string;
    startDate?: string | Date;
    endDate?: string | Date;
}

@Injectable()
export class ProjectsService {
    constructor(private prisma: PrismaService) { }

    async create(organizationId: string, data: CreateProjectDto) {
        return this.prisma.project.create({
            data: {
                organizationId,
                ...data,
            },
        });
    }

    async findAll(organizationId: string) {
        const projects = await this.prisma.project.findMany({
            where: { organizationId },
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
        });
    }

    async update(id: string, organizationId: string, data: Partial<CreateProjectDto>) {
        await this.prisma.project.updateMany({
            where: { id, organizationId },
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
