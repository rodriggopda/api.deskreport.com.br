import { Test, TestingModule } from '@nestjs/testing';
import { TeamsService } from '../teams.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a team with members', async () => {
      const organizationId = 'org-1';
      const teamData = { name: 'Dev Team', members: ['user-1', 'user-2'] };
      
      prisma.team.create.mockResolvedValue({ id: 'team-1', ...teamData });

      const result = await service.create(organizationId, teamData);

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: {
          name: 'Dev Team',
          organizationId,
          members: {
            create: [
              { userId: 'user-1', role: 'member' },
              { userId: 'user-2', role: 'member' }
            ]
          }
        },
        include: expect.any(Object)
      });
      expect(result.id).toBe('team-1');
    });
  });

  describe('update', () => {
    it('should update team and replace members if provided', async () => {
      const id = 'team-1';
      const organizationId = 'org-1';
      const updateData = { name: 'New Name', members: ['user-3'] };

      prisma.team.findFirst.mockResolvedValue({ id });
      prisma.team.update.mockResolvedValue({ id, name: 'New Name' });

      await service.update(id, organizationId, updateData);

      // Verify members were reset
      expect(prisma.teamMember.deleteMany).toHaveBeenCalledWith({
        where: { teamId: id }
      });

      // Verify new members were added
      expect(prisma.teamMember.createMany).toHaveBeenCalledWith({
        data: [
          { teamId: id, userId: 'user-3', role: 'member' }
        ]
      });

      // Verify name was updated
      expect(prisma.team.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id },
        data: { name: 'New Name' }
      }));
    });

    it('should not touch a team from another organization', async () => {
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(service.update('team-x', 'org-1', { name: 'Hack', members: ['user-1'] })).rejects.toThrow('Team not found');
      expect(prisma.teamMember.deleteMany).not.toHaveBeenCalled();
      expect(prisma.team.update).not.toHaveBeenCalled();
    });
  });
});
