import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId?: string) {
    if (organizationId) {
      return this.prisma.user.findMany({
        where: {
          members: {
            some: {
              organizationId,
            },
          },
        },
        include: {
          members: true,
        },
      });
    }
    return this.prisma.user.findMany({
      include: {
        members: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            roleProfile: true,
          },
        },
      },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
