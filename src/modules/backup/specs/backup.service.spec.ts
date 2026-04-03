import { Test, TestingModule } from '@nestjs/testing';
import { BackupService } from '../backup.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaServiceMock } from '../../../test-utils/prisma-service.mock';

describe('BackupService', () => {
  let service: BackupService;
  let prisma: PrismaServiceMock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useClass: PrismaServiceMock },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportAll', () => {
    it('should export all organization data as JSON', async () => {
      const orgId = 'org-1';
      
      prisma.task.findMany.mockResolvedValue([]);
      prisma.project.findMany.mockResolvedValue([]);
      prisma.team.findMany.mockResolvedValue([]);
      prisma.member.findMany.mockResolvedValue([]);
      (prisma as any).integration = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await service.exportAll(orgId);
      
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('data');
      expect(result.organizationId).toBe(orgId);
    });
  });

  describe('importAll', () => {
    it('should validate backup data', async () => {
      const orgId = 'org-new';
      const backupData = {
        version: '1.0',
        data: {
          tasks: [],
          projects: [],
          teams: [],
          members: [],
          integrations: []
        }
      };

      const result = await service.importAll(orgId, backupData);
      
      expect(result.ok).toBe(true);
      expect(result.message).toBeDefined();
    });
  });
});
