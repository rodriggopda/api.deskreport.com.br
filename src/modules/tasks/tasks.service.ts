import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService) { }

    async create(organizationId: string, data: any) {
        const { assigneeIds, ...rest } = data;
        rest.companyId = organizationId;

        const lastTask = await this.prisma.task.findFirst({
            where: { companyId: organizationId },
            orderBy: { shortId: 'desc' },
        });

        const shortId = lastTask ? lastTask.shortId + 1 : 1;

        return this.prisma.task.create({
            data: {
                ...rest,
                shortId,
                assignees: assigneeIds ? {
                    connect: assigneeIds.map((id: string) => ({ id }))
                } : undefined
            },
            include: {
                assignees: true,
                team: true,
                comments: { include: { user: true }, orderBy: { createdAt: 'desc' } }
            }
        });
    }

    async findAll(organizationId: string) {
        return this.prisma.task.findMany({
            where: { companyId: organizationId },
            include: {
                assignees: true,
                team: true,
                comments: { include: { user: true }, orderBy: { createdAt: 'desc' } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async findOne(id: string, organizationId: string) {
        return this.prisma.task.findFirst({
            where: { id, companyId: organizationId },
            include: {
                assignees: true,
                team: true,
                comments: { include: { user: true }, orderBy: { createdAt: 'asc' } }
            }
        });
    }

    async update(id: string, organizationId: string, data: any) {
        await this.ensureTaskInOrg(id, organizationId);

        const { title, description, project, status, priority, tags, dueDate, teamId, assigneeIds } = data;

        await this.prisma.task.update({
            where: { id },
            data: {
                title,
                description,
                project,
                status,
                priority,
                tags,
                dueDate,
                teamId,
                assignees: assigneeIds ? {
                    set: assigneeIds.map((id: string) => ({ id }))
                } : undefined
            }
        });

        return this.findOne(id, organizationId);
    }

    async addComment(id: string, organizationId: string, userId: string, content: string) {
        await this.ensureTaskInOrg(id, organizationId);

        await this.prisma.taskComment.create({
            data: {
                taskId: id,
                userId,
                content
            }
        });

        return this.findOne(id, organizationId);
    }

    private async ensureTaskInOrg(id: string, organizationId: string) {
        const task = await this.prisma.task.findFirst({
            where: { id, companyId: organizationId },
            select: { id: true }
        });

        if (!task) {
            throw new NotFoundException('Task not found');
        }
    }

    async remove(id: string, organizationId: string) {
        return this.prisma.task.deleteMany({
            where: { id, companyId: organizationId }
        });
    }
}
