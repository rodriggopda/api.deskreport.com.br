import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from '../attachments.service';

describe('AttachmentsService', () => {
  const prisma: any = {
    task: { findFirst: jest.fn() },
    taskAttachment: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  };
  const service = new AttachmentsService(prisma);

  afterEach(() => jest.clearAllMocks());

  it('lista só anexos da tarefa na organização', async () => {
    prisma.taskAttachment.findMany.mockResolvedValue([]);
    await service.list('org-1', 'task-1');
    expect(prisma.taskAttachment.findMany.mock.calls[0][0].where).toEqual({ taskId: 'task-1', companyId: 'org-1' });
  });

  it('recusa formato fora da lista', async () => {
    const file = { originalname: 'script.sh', buffer: Buffer.from('x'), size: 1 };
    await expect(service.upload('org-1', 'task-1', file)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa upload em tarefa de outra organização', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    const file = { originalname: 'SPEC.md', buffer: Buffer.from('# spec'), size: 6 };
    await expect(service.upload('org-2', 'task-1', file)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.task.findFirst.mock.calls[0][0].where).toEqual({ id: 'task-1', companyId: 'org-2' });
  });

  it('não encontra anexo de outra organização', async () => {
    prisma.taskAttachment.findFirst.mockResolvedValue(null);
    await expect(service.remove('org-2', 'task-1', 'att-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.taskAttachment.findFirst.mock.calls[0][0].where).toEqual({ id: 'att-1', taskId: 'task-1', companyId: 'org-2' });
    expect(prisma.taskAttachment.deleteMany).not.toHaveBeenCalled();
  });
});
