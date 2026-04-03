import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from '../tasks.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a task with an incremented shortId', async () => {
      const organizationId = 'org-1';
      const taskData = { title: 'New Task', assigneeIds: ['user-1'] };
      
      prisma.task.findFirst.mockResolvedValue({ shortId: 10 }); // Last task had shortId 10
      prisma.task.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'task-123', ...data }));

      const result = await service.create(organizationId, taskData);

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { companyId: organizationId },
        orderBy: { shortId: 'desc' },
      });
      
      expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          title: 'New Task',
          shortId: 11, // 10 + 1
          companyId: organizationId
        })
      }));
      
      expect(result.shortId).toBe(11);
    });

    it('should start shortId at 1 if no previous tasks exist', async () => {
      const organizationId = 'org-1';
      const taskData = { title: 'First Task' };
      
      prisma.task.findFirst.mockResolvedValue(null);
      prisma.task.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'task-1', ...data }));

      const result = await service.create(organizationId, taskData);

      expect(result.shortId).toBe(1);
    });
  });

  describe('addComment', () => {
    it('should create a comment and return the task', async () => {
        const id = 'task-1';
        const orgId = 'org-1';
        const userId = 'user-1';
        const content = 'Hello world';

        prisma.taskComment.create.mockResolvedValue({ id: 'comment-1' });
        // findOne is called after create, which calls findFirst
        prisma.task.findFirst.mockResolvedValue({ id, companyId: orgId, title: 'Task' });

        const result = await service.addComment(id, orgId, userId, content);

        expect(prisma.taskComment.create).toHaveBeenCalledWith({
            data: { taskId: id, userId, content }
        });
        expect(result.id).toBe(id);
    });
  });
});

