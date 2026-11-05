import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from '../tasks.controller';
import { TasksService } from '../tasks.service';
import { AgentsGateway } from '../../agents/agents.gateway';

jest.mock('../../../auth/auth', () => ({ auth: {} }));
jest.mock('../../agents/agents.gateway', () => ({ AgentsGateway: class AgentsGateway { } }));

describe('TasksController', () => {
  let controller: TasksController;
  const tasksService = { addComment: jest.fn() };
  const agentsGateway = { dispatchTask: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: tasksService },
        { provide: AgentsGateway, useValue: agentsGateway },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('comentário sem agente não dispara nada', async () => {
    tasksService.addComment.mockResolvedValue({ id: 't1', assignees: [] });

    await controller.addComment('org1', 'u1', 't1', { content: '<p>ok</p>' });

    expect(agentsGateway.dispatchTask).not.toHaveBeenCalled();
  });

  it('comentário com @claude dispara o agente em modo comment e atribui', async () => {
    tasksService.addComment.mockResolvedValue({ id: 't1', assignees: [] });
    agentsGateway.dispatchTask.mockResolvedValue({ task: { assignees: [{ id: 'agent-user-claude' }] } });

    const task = await controller.addComment('org1', 'u1', 't1', { content: '<p>@claude pode ajustar?</p>', projectPath: 'api' });

    expect(agentsGateway.dispatchTask).toHaveBeenCalledWith('org1', 't1', {
      agent: 'claude',
      mode: 'comment',
      comment: '<p>@claude pode ajustar?</p>',
      projectPath: 'api',
    });
    expect(task?.assignees).toEqual([{ id: 'agent-user-claude' }]);
  });

  it('agente escolhido no seletor dispara mesmo sem menção', async () => {
    tasksService.addComment.mockResolvedValue({ id: 't1', assignees: [] });
    agentsGateway.dispatchTask.mockResolvedValue(null);

    await controller.addComment('org1', 'u1', 't1', { content: '<p>dúvida</p>', agent: 'opencode' });

    expect(agentsGateway.dispatchTask).toHaveBeenCalledWith('org1', 't1', expect.objectContaining({ agent: 'opencode', mode: 'comment' }));
  });
});
