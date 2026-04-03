import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from '../billing.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should find subscription for an org', async () => {
    const orgId = 'org-1';
    prisma.subscription.findFirst.mockResolvedValue({ id: 's1', organizationId: orgId });

    const result = await service.getSubscriptionForOrg(orgId);

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
      where: { organizationId: orgId }
    });
    expect(result.id).toBe('s1');
  });

  it('should calculate pro-rata correctly', async () => {
    const currentUsers = 5;
    const newUsers = 10;
    const billingCycleDays = 30;
    const remainingDays = 15;

    // (10 - 5) * 20 * 15 / 30 = 5 * 20 * 0.5 = 100 * 0.5 = 50
    const result = await service.proRataCalculation(currentUsers, newUsers, billingCycleDays, remainingDays);

    expect(result).toBe(50);
  });
});
