import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should find all notifications for a user', async () => {
    const userId = 'user-1';
    prisma.notification.findMany.mockResolvedValue([{ id: 'n1', userId }]);

    const result = await service.findAll(userId);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(1);
  });

  it('should create a notification', async () => {
    const userId = 'user-1';
    const title = 'Alert';
    const message = 'Test';
    prisma.notification.create.mockResolvedValue({ id: 'n1', title });

    const result = await service.create(userId, title, message);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId, title, message }
    });
    expect(result.id).toBe('n1');
  });
});
