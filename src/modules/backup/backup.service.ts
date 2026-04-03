import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BackupService {
  constructor(private prisma: PrismaService) {}

  async exportAll(organizationId: string) {
    const [tasks, projects, teams, members, integrations] = await Promise.all([
      this.prisma.task.findMany({ where: { companyId: organizationId } }),
      this.prisma.project.findMany({ where: { organizationId } }),
      this.prisma.team.findMany({ where: { organizationId } }),
      this.prisma.member.findMany({ where: { organizationId } }),
      (this.prisma as any).integration?.findMany({ where: { organizationId } }) || Promise.resolve([]),
    ]);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      organizationId,
      data: {
        tasks,
        projects,
        teams,
        members,
        integrations,
      },
    };
  }

  async importAll(organizationId: string, backupData: any) {
    // This is complex and should be done with caution.
    // For now, let's implement a basic version that validates the JSON.
    if (!backupData.data || !backupData.version) {
      throw new Error('Invalid backup format');
    }
    
    // In a real implementation, we would use transactions to import data safely.
    // For now, we just acknowledge the receipt.
    return { ok: true, message: 'Backup received and validated' };
  }
}
