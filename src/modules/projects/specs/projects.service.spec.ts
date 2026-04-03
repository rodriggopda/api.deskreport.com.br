import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from '../projects.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return projects with calculated percentages correctly', async () => {
      const organizationId = 'org-1';
      const mockProjects = [
        { id: 'project-1', organizationId, name: 'Project 1', teams: [] },
        { id: 'project-2', organizationId, name: 'Project 2', teams: [] },
      ];
      
      const mockTasksStats = [
        { project: 'project-1', status: 'done', _count: { id: 2 } },
        { project: 'project-1', status: 'todo', _count: { id: 2 } },
        { project: 'project-2', status: 'completed', _count: { id: 5 } },
        { project: 'project-2', status: 'doing', _count: { id: 0 } },
      ];

      prisma.project.findMany.mockResolvedValue(mockProjects);
      prisma.task.groupBy.mockResolvedValue(mockTasksStats);

      const result = await service.findAll(organizationId);

      expect(result).toHaveLength(2);
      
      // Project 1: (2 done) / (2 done + 2 todo) = 2/4 = 50%
      expect(result[0].id).toBe('project-1');
      expect(result[0].total_tasks).toBe(4);
      expect(result[0].completed_tasks).toBe(2);
      expect(result[0].completion_percentage).toBe(50);

      // Project 2: (5 completed) / (5 completed + 0 doing) = 5/5 = 100%
      expect(result[1].id).toBe('project-2');
      expect(result[1].total_tasks).toBe(5);
      expect(result[1].completed_tasks).toBe(5);
      expect(result[1].completion_percentage).toBe(100);
    });

    it('should return 0% if project has no tasks', async () => {
      const organizationId = 'org-1';
      const mockProjects = [
        { id: 'project-empty', organizationId, name: 'Empty Project', teams: [] },
      ];
      
      prisma.project.findMany.mockResolvedValue(mockProjects);
      prisma.task.groupBy.mockResolvedValue([]);

      const result = await service.findAll(organizationId);

      expect(result[0].completion_percentage).toBe(0);
      expect(result[0].total_tasks).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a project with teams', async () => {
      const organizationId = 'org-1';
      const createDto = {
        name: 'New Project',
        teamIds: ['team-1', 'team-2']
      };

      prisma.project.create.mockResolvedValue({ id: 'new-id', ...createDto, organizationId });

      const result = await service.create(organizationId, createDto);

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          name: createDto.name,
          teams: {
            create: [
              { teamId: 'team-1' },
              { teamId: 'team-2' }
            ]
          }
        },
        include: expect.any(Object)
      });
      expect(result.id).toBe('new-id');
    });
  });
});

