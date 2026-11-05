import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsService } from '../integrations.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should find all integrations for an organization', async () => {
    const orgId = 'org-1';
    prisma.integration.findMany.mockResolvedValue([]);

    await service.findAll(orgId);

    expect(prisma.integration.findMany).toHaveBeenCalledWith({
      where: { organizationId: orgId }
    });
  });

  it('should create an integration', async () => {
    const orgId = 'org-1';
    const type = 'slack';
    const config = { webhook: 'http://foo' };
    prisma.integration.create.mockResolvedValue({ id: 'i1', type });

    const result = await service.create(orgId, type, config);

    expect(prisma.integration.create).toHaveBeenCalledWith({
      data: { organizationId: orgId, type, config }
    });
    expect(result.id).toBe('i1');
  });
});
