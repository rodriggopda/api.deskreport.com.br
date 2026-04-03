import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should find all users in an organization', async () => {
      const orgId = 'org-1';
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'test@test.com' }]);

      const result = await service.findAll(orgId);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          members: {
            some: { organizationId: orgId }
          }
        }
      }));
      expect(result).toHaveLength(1);
    });

    it('should find all users globally if no orgId', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        include: { members: true }
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const id = 'u1';
      const data = { name: 'New Name' };
      prisma.user.update.mockResolvedValue({ id, ...data });

      const result = await service.update(id, data);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id },
        data
      });
      expect(result.name).toBe('New Name');
    });
  });
});
