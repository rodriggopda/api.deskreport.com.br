import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { AgentsService } from '../agents.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { mockPrismaService } from '../../../test-utils/prisma-service.mock';

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get(AgentsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('cria a máquina guardando só o hash da chave', async () => {
    prisma.agentMachine.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'm-1', ...data }));

    const result = await service.createMachine('org-1', { name: 'Workstation', workspaceRoot: '/home/dev' });
    const saved = prisma.agentMachine.create.mock.calls[0][0].data;

    expect(result.token.startsWith('drk_')).toBe(true);
    expect(saved.tokenHash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(JSON.stringify(saved)).not.toContain(result.token);
  });

  it('remove a máquina só dentro da organização', async () => {
    prisma.agentMachine.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeMachine('m-1', 'org-2')).rejects.toThrow('Machine not found');
    expect(prisma.agentMachine.deleteMany).toHaveBeenCalledWith({ where: { id: 'm-1', organizationId: 'org-2' } });
  });

  it('não dispara task de outra organização', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(service.startDispatch('t-1', 'org-2', { agent: 'claude' })).rejects.toThrow('Task not found');
    expect(prisma.task.findFirst.mock.calls[0][0].where).toEqual({ id: 't-1', companyId: 'org-2' });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('recusa agente ou pasta inválidos', async () => {
    await expect(service.startDispatch('t-1', 'org-1', { agent: 'bash' })).rejects.toThrow();
    await expect(service.startDispatch('t-1', 'org-1', { agent: 'claude', projectPath: '../etc' })).rejects.toThrow();
  });

  it('cria como membros só os agentes habilitados pela máquina', async () => {
    await service.setEnabledAgents('org-1', ['codex', 'opencode', 'bash', 'codex']);

    expect(prisma.user.upsert.mock.calls.map((c: any) => c[0].where.id)).toEqual(['agent-user-opencode', 'agent-user-codex']);
    expect(prisma.member.upsert.mock.calls[0][0].where).toEqual({ organizationId_userId: { organizationId: 'org-1', userId: 'agent-user-opencode' } });
    expect((await service.statusList('org-1')).map((a) => a.agent)).toEqual(['opencode', 'codex']);
    prisma.member.findMany.mockResolvedValue([]);
    expect(await service.statusList('org-2')).toEqual([]);
  });

  it('sem máquina conectada usa os agentes que já são membros', async () => {
    prisma.member.findMany.mockResolvedValue([{ userId: 'agent-user-gemini' }]);

    expect((await service.statusList('org-1')).map((a) => a.agent)).toEqual(['gemini']);
    expect(prisma.member.findMany.mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('atribui o agente na task ao disparar', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't-1', title: 'T', status: 'todo', assignees: [], comments: [{ userId: 'u-1', content: 'ok' }, { userId: 'agent-user-claude', content: 'feito' }] });
    prisma.task.update.mockResolvedValue({ id: 't-1' });

    const result = await service.startDispatch('t-1', 'org-1', { agent: 'claude', projectPath: 'api' });

    expect(prisma.task.update.mock.calls[0][0].data).toEqual({ status: 'in-progress', assignees: { connect: { id: 'agent-user-claude' } } });
    expect(result.comments).toEqual(['ok']);
    expect(result.task).toEqual({ id: 't-1' });
  });

  it('sem agent e sem pasta usa o agente responsável e a pasta do projeto da tarefa', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't-1', project: 'p-1', status: 'todo', assignees: [{ id: 'u-1' }, { id: 'agent-user-opencode' }], comments: [] });
    prisma.project.findFirst.mockResolvedValue({ folder: 'deskreport.com.br' });
    prisma.task.update.mockResolvedValue({ id: 't-1' });

    const result = await service.startDispatch('t-1', 'org-1', {});

    expect(result.agent).toBe('opencode');
    expect(result.projectPath).toBe('deskreport.com.br');
    expect(prisma.project.findFirst.mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('recusa disparar sem agente responsável ou sem pasta no projeto', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't-1', project: 'p-1', assignees: [{ id: 'u-1' }], comments: [] });
    await expect(service.startDispatch('t-1', 'org-1', {})).rejects.toThrow('Atribua um agente');

    prisma.project.findFirst.mockResolvedValue({ folder: null });
    await expect(service.startDispatch('t-1', 'org-1', { agent: 'claude' })).rejects.toThrow('Sincronize as pastas');
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('sincroniza pastas como projetos da organização', async () => {
    prisma.project.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p-2', folder: null });

    await service.syncProjects('org-1', ['api', 'site']);

    expect(prisma.project.create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', name: 'api', folder: 'api' } });
    expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p-2' }, data: { folder: 'site' } });
    await expect(service.syncProjects('org-1', ['../etc'])).rejects.toThrow();
  });

  it('move a task para revisão do Antigravity e comenta como o agente', async () => {
    await service.setEnabledAgents('org-1', ['claude', 'antigravity']);
    prisma.task.findFirst.mockResolvedValue({ id: 't-1', reporterId: 'u-1' });

    await service.finishTask('org-1', { taskId: 't-1', agent: 'claude', exitCode: 0, summary: '<script>x</script>', touchedFiles: ['M a.ts'] });

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { status: 'review', assignees: { connect: { id: 'agent-user-antigravity' } } },
    });
    expect(prisma.taskComment.create.mock.calls[0][0].data.userId).toBe('agent-user-claude');
    const content = prisma.taskComment.create.mock.calls[0][0].data.content;
    expect(content).toContain('&lt;script&gt;');
    expect(content).toContain('<li>M a.ts</li>');
  });

  it('sem Antigravity habilitado a task vai para revisão sem revisor', async () => {
    await service.setEnabledAgents('org-1', ['codex']);
    prisma.task.findFirst.mockResolvedValue({ id: 't-1', reporterId: 'u-1' });

    await service.finishTask('org-1', { taskId: 't-1', agent: 'codex', exitCode: 0 });

    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { status: 'review' } });
    expect(prisma.taskComment.create.mock.calls[0][0].data.userId).toBe('agent-user-codex');
  });

  it('ignora telemetria de agente desconhecido', async () => {
    await service.setEnabledAgents('org-1', ['claude']);
    expect(service.saveStatus('org-1', { agent: 'outro', state: 'working' })).toBeNull();
    expect((await service.statusList('org-1')).map((a) => a.agent)).toEqual(['claude']);
  });

  it('guarda a mensagem entre agentes assinada por quem enviou e com a tarefa da organização', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't-1' });
    prisma.agentChatMessage.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'msg-1', ...data }));

    await service.saveTeamMessage('org-1', 'claude', { toAgent: 'antigravity', message: 'Pode revisar?', taskId: '#3' });

    expect(prisma.task.findFirst).toHaveBeenCalledWith({ where: { companyId: 'org-1', shortId: 3 }, select: { id: true } });
    expect(prisma.agentChatMessage.create.mock.calls[0][0].data).toEqual({
      organizationId: 'org-1',
      agent: 'claude',
      userId: 'agent-user-claude',
      targetAgent: 'antigravity',
      taskId: 't-1',
      content: 'Pode revisar?',
    });
  });

  it('não deixa o agente mandar mensagem para ele mesmo nem para agente desconhecido', async () => {
    await expect(service.saveTeamMessage('org-1', 'claude', { toAgent: 'claude', message: 'oi' })).rejects.toThrow('toAgent');
    await expect(service.saveTeamMessage('org-1', 'claude', { toAgent: 'outro', message: 'oi' })).rejects.toThrow('agent deve ser');
  });

  it('a sala do time só lista mensagens sem dono da organização', async () => {
    prisma.agentChatMessage.findMany.mockResolvedValue([]);

    await service.listTeamChat('org-1', {});

    expect(prisma.agentChatMessage.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', ownerId: null, taskId: undefined });
  });

  it('aceita o estado pausado com alerta de cota', async () => {
    const status = service.saveStatus('org-1', { agent: 'claude', state: 'paused', alert: 'Alerta de Cota' });
    expect(status).toMatchObject({ state: 'paused', alert: 'Alerta de Cota' });
  });

  it('parada pelo usuário volta a task para A fazer e soma os tokens', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 't-1', reporterId: 'u-1', status: 'in-progress' });

    await service.finishTask('org-1', { taskId: 't-1', agent: 'claude', exitCode: 1, stopped: true, tokens: 1200 });

    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { tokensUsed: { increment: 1200 } } });
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: { status: 'todo' } });
    expect(prisma.taskComment.create.mock.calls[0][0].data.content).toContain('parada pelo usuário');
  });

  it('não para task de outra organização', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(service.findTaskToStop('t-1', 'org-2')).rejects.toThrow('Task not found');
    expect(prisma.task.findFirst.mock.calls[0][0].where).toEqual({ id: 't-1', companyId: 'org-2' });
  });

  it('guarda a saída do terminal separada por organização', () => {
    service.appendOutput('org-1', { taskId: 't-1', text: 'linha 1\n' });
    service.appendOutput('org-1', { taskId: 't-1', text: 'linha 2\n' });

    expect(service.taskOutput('org-1', 't-1').text).toBe('linha 1\nlinha 2\n');
    expect(service.taskOutput('org-2', 't-1').text).toBe('');
    expect(service.appendOutput('org-1', { taskId: 't-1', text: 123 })).toBeNull();
  });
});
