import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getProjectStats(projectId: string) {
    const tasks = await this.prisma.task.groupBy({
      by: ['status'],
      where: { project: projectId },
      _count: { id: true },
    });
    return tasks;
  }

  async getUserActivities(userId: string) {
    return this.prisma.taskComment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        task: true
      }
    });
  }

  async getSystemOverview() {
    const [tasksCount, projectsCount, teamsCount, usersCount] = await Promise.all([
      this.prisma.task.count(),
      this.prisma.project.count(),
      this.prisma.team.count(),
      this.prisma.user.count(),
    ]);

    return {
      tasksCount,
      projectsCount,
      teamsCount,
      usersCount,
    };
  }
}
