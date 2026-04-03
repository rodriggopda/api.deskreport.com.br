import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from '../reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should get project stats', async () => {
    const projectId = 'proj-1';
    prisma.task.groupBy.mockResolvedValue([]);

    await service.getProjectStats(projectId);

    expect(prisma.task.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { project: projectId }
    }));
  });

  it('should get system overview', async () => {
    prisma.task.count.mockResolvedValue(10);
    prisma.project.count.mockResolvedValue(2);
    prisma.team.count.mockResolvedValue(1);
    prisma.user.count.mockResolvedValue(5);

    const result = await service.getSystemOverview();

    expect(result.tasksCount).toBe(10);
    expect(result.usersCount).toBe(5);
  });
});
