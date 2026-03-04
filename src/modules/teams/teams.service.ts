import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeamsService {
    constructor(private prisma: PrismaService) { }

    async create(organizationId: string, data: any) {
        const { members, ...teamData } = data;

        return this.prisma.team.create({
            data: {
                ...teamData,
                organizationId,
                members: {
                    create: members?.map((userId: string) => ({
                        userId,
                        role: 'member'
                    }))
                }
            },
            include: {
                members: {
                    include: {
                        user: true
                    }
                }
            }
        });
    }

    async findAll(organizationId: string) {
        return this.prisma.team.findMany({
            where: { organizationId },
            include: {
                _count: {
                    select: { members: true, tasks: true }
                },
                members: {
                    include: {
                        user: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async findOne(id: string, organizationId: string) {
        return this.prisma.team.findFirst({
            where: { id, organizationId },
            include: {
                members: {
                    include: {
                        user: true
                    }
                },
                tasks: true
            }
        });
    }

    async update(id: string, organizationId: string, data: any) {
        const { members, ...teamData } = data;

        // If members are provided, we replace them
        if (members) {
            await this.prisma.teamMember.deleteMany({
                where: { teamId: id }
            });

            await this.prisma.teamMember.createMany({
                data: members.map((userId: string) => ({
                    teamId: id,
                    userId,
                    role: 'member'
                }))
            });
        }

        return this.prisma.team.update({
            where: { id },
            data: teamData,
            include: {
                members: {
                    include: {
                        user: true
                    }
                }
            }
        });
    }

    async remove(id: string, organizationId: string) {
        return this.prisma.team.deleteMany({
            where: { id, organizationId }
        });
    }
}
