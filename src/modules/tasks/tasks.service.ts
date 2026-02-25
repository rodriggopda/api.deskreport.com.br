import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService) { }

    async create(organizationId: string, data: any) {
        data.companyId = organizationId;

        const lastTask = await this.prisma.task.findFirst({
            where: { companyId: organizationId },
            orderBy: { shortId: 'desc' },
        });

        const shortId = lastTask ? lastTask.shortId + 1 : 1;

        return this.prisma.task.create({
            data: { ...data, shortId }
        });
    }

    async findAll(organizationId: string) {
        return this.prisma.task.findMany({
            where: { companyId: organizationId },
            orderBy: { createdAt: 'desc' }
        });
    }

    async findOne(id: string, organizationId: string) {
        return this.prisma.task.findFirst({
            where: { id, companyId: organizationId }
        });
    }

    async update(id: string, organizationId: string, data: any) {
        await this.prisma.task.updateMany({
            where: { id, companyId: organizationId },
            data
        });
        return this.findOne(id, organizationId);
    }

    async remove(id: string, organizationId: string) {
        return this.prisma.task.deleteMany({
            where: { id, companyId: organizationId }
        });
    }
}
