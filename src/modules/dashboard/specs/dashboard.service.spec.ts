import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaServiceMock } from '../../../test-utils/prisma-service.mock';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaServiceMock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useClass: PrismaServiceMock },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = module.get(PrismaService);

    // Default mocks to avoid "cannot read length of undefined"
    prisma.project.count.mockResolvedValue(0);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);
    prisma.task.groupBy.mockResolvedValue([]);
    prisma.member.count.mockResolvedValue(0);
    prisma.member.findMany.mockResolvedValue([]);
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', name: 'User', email: 'u@t.com', image: 'img' });
    prisma.organization.findFirst.mockResolvedValue({ id: 'o1', metadata: '{}' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHomeData', () => {
    it('should aggregate checklist and radar data correctly', async () => {
      const orgId = 'org-1';
      const userId = 'user-1';

      // Setup specific mocks for this test
      prisma.project.count.mockResolvedValue(5);
      prisma.task.findMany.mockResolvedValue([
        { id: 't1', status: 'pending', dueDate: new Date(Date.now() + 86400000) }
      ]);
      prisma.project.findMany.mockResolvedValue([
        { id: 'p1', name: 'At Risk Proj', endDate: new Date() }
      ]);
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        metadata: JSON.stringify({ planId: 'premium', integrationsCount: 1 })
      });

      const result = await service.getHomeData(orgId, userId);

      expect(result).toHaveProperty('checklist');
      expect(result).toHaveProperty('radar');
      expect(result).toHaveProperty('summary');
      
      const planItem = result.checklist.find(i => i.id === 'plan');
      expect(planItem?.completed).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return dashboard metrics including pending and overdue tasks', async () => {
      const orgId = 'org-1';
      prisma.project.count.mockResolvedValue(10);
      prisma.task.findMany.mockResolvedValue([
        { status: 'pending', dueDate: new Date(Date.now() - 86400000) }, // overdue
        { status: 'completed', dueDate: null },
        { status: 'todo', dueDate: new Date(Date.now() + 86400000) }    // pending, not overdue
      ]);
      prisma.member.count.mockResolvedValue(5);

      const summary = await service.getSummary(orgId);
      
      expect(summary.total_projects).toBe(10);
      expect(summary.total_tasks).toBe(3);
      expect(summary.pending_tasks).toBe(2);
      expect(summary.overdue_tasks).toBe(1);
    });
  });
});
