import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    // Note: Notification table might not exist in Prisma schema yet.
    // For unit testing with mocks, we assume it does.
    return (this.prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string) {
    return (this.prisma as any).notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async create(userId: string, title: string, message: string) {
    return (this.prisma as any).notification.create({
      data: { userId, title, message },
    });
  }
}
