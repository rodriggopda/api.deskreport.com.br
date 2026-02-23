import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService) { }

    async create(data: any) {
        data.companyId = data.companyId || 'deskreport';

        const lastTask = await this.prisma.task.findFirst({
            where: { companyId: data.companyId },
            orderBy: { shortId: 'desc' },
        });

        const shortId = lastTask ? lastTask.shortId + 1 : 1;

        return this.prisma.task.create({
            data: { ...data, shortId }
        });
    }

    async findAll() {
        return this.prisma.task.findMany({
            orderBy: { createdAt: 'desc' }
        });
    }

    async findOne(id: string) {
        return this.prisma.task.findUnique({ where: { id } });
    }

    async update(id: string, data: any) {
        return this.prisma.task.update({ where: { id }, data });
    }

    async remove(id: string) {
        return this.prisma.task.delete({ where: { id } });
    }
}
