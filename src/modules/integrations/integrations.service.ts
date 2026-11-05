import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return (this.prisma as any).integration.findMany({
      where: { organizationId },
    });
  }

  async create(organizationId: string, type: string, config: any) {
    return (this.prisma as any).integration.create({
      data: { organizationId, type, config },
    });
  }

  async update(id: string, config: any) {
    return (this.prisma as any).integration.update({
      where: { id },
      data: { config },
    });
  }

  async remove(id: string) {
    return (this.prisma as any).integration.delete({
      where: { id },
    });
  }
}
