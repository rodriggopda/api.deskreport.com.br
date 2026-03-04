import { Injectable } from '@nestjs/common';
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
            include: { assignees: true, team: true }
        });
    }

    async findAll(organizationId: string) {
        return this.prisma.task.findMany({
            where: { companyId: organizationId },
            include: { assignees: true, team: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    async findOne(id: string, organizationId: string) {
        return this.prisma.task.findFirst({
            where: { id, companyId: organizationId },
            include: { assignees: true, team: true }
        });
    }

    async update(id: string, organizationId: string, data: any) {
        const { assigneeIds, ...rest } = data;

        await this.prisma.task.update({
            where: { id },
            data: {
                ...rest,
                assignees: assigneeIds ? {
                    set: assigneeIds.map((id: string) => ({ id }))
                } : undefined
            }
        });

        return this.findOne(id, organizationId);
    }

    async remove(id: string, organizationId: string) {
        return this.prisma.task.deleteMany({
            where: { id, companyId: organizationId }
        });
    }
}
