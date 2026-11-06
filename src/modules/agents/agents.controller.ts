import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ActiveOrg } from '../../auth/active-org.decorator';
import { ActiveUser } from '../../auth/active-user.decorator';
import { AgentsGateway } from './agents.gateway';
import { AgentsService, compactTask } from './agents.service';

@Controller()
export class AgentsController {
  constructor(
    private agentsService: AgentsService,
    private agentsGateway: AgentsGateway,
  ) { }

  @Get('agents/machines')
  async list(@ActiveOrg() orgId: string) {
    return {
      machines: await this.agentsService.listMachines(orgId),
      agents: await this.agentsService.statusList(orgId),
    };
  }

  @Post('agents/machines')
  create(@ActiveOrg() orgId: string, @Body() data: any) {
    return this.agentsService.createMachine(orgId, data);
  }

  @Delete('agents/machines/:id')
  remove(@ActiveOrg() orgId: string, @Param('id') id: string) {
    return this.agentsService.removeMachine(id, orgId);
  }

  @Post('tasks/:id/dispatch')
  dispatch(@ActiveOrg() orgId: string, @Param('id') id: string, @Body() data: any) {
    return this.agentsGateway.dispatchTask(orgId, id, data);
  }

  @Post('tasks/:id/stop')
  stop(@ActiveOrg() orgId: string, @Param('id') id: string) {
    return this.agentsGateway.stopTask(orgId, id);
  }

  @Get('tasks/:id/terminal')
  terminal(@ActiveOrg() orgId: string, @Param('id') id: string) {
    return this.agentsService.taskOutput(orgId, id);
  }

  // Sala do time, declarada antes de agents/:agent para não cair na rota do agente
  @Get('agents/team/messages')
  teamMessages(@ActiveOrg() orgId: string, @Query() query: any) {
    return this.agentsService.listTeamChat(orgId, query);
  }

  @Post('agents/:agent/quota/continue')
  continueQuota(@ActiveOrg() orgId: string, @Param('agent') agent: string) {
    return this.agentsGateway.continueQuota(orgId, agent);
  }

  // Sessões do Chat Lateral, sempre do usuário logado na organização ativa
  @Get('agents/:agent/sessions')
  sessions(@ActiveOrg() orgId: string, @ActiveUser() userId: string, @Param('agent') agent: string) {
    return this.agentsService.listSessions(orgId, userId, agent);
  }

  @Post('agents/:agent/sessions')
  createSession(@ActiveOrg() orgId: string, @ActiveUser() userId: string, @Param('agent') agent: string, @Body() data: any) {
    return this.agentsService.createSession(orgId, userId, agent, data);
  }

  @Get('agents/sessions/:sessionId/messages')
  sessionMessages(@ActiveOrg() orgId: string, @ActiveUser() userId: string, @Param('sessionId') sessionId: string) {
    return this.agentsService.listSessionMessages(orgId, userId, sessionId);
  }

  @Post('agents/sessions/:sessionId/messages')
  sendSessionMessage(@ActiveOrg() orgId: string, @ActiveUser() userId: string, @Param('sessionId') sessionId: string, @Body() data: any) {
    return this.agentsGateway.sendSessionChat(orgId, userId, sessionId, data);
  }

  @Delete('agents/sessions/:sessionId')
  deleteSession(@ActiveOrg() orgId: string, @ActiveUser() userId: string, @Param('sessionId') sessionId: string) {
    return this.agentsService.deleteSession(orgId, userId, sessionId);
  }

  // Rotas do MCP (deskreport mcp): autenticadas pela chave da máquina, sem sessão do navegador
  @AllowAnonymous()
  @Get('agents/mcp/projects')
  async mcpProjects(@Headers('authorization') authorization: string) {
    const orgId = await this.machineOrg(authorization);
    return this.agentsService.listProjects(orgId);
  }

  @AllowAnonymous()
  @Post('agents/mcp/projects')
  async mcpCreateProject(@Headers('authorization') authorization: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    return this.agentsService.createProject(orgId, data);
  }

  // Widget do client: pastas do Workspace viram projetos
  @AllowAnonymous()
  @Post('agents/mcp/projects/sync')
  async mcpSyncProjects(@Headers('authorization') authorization: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    return this.agentsService.syncProjects(orgId, data?.folders);
  }

  @AllowAnonymous()
  @Get('agents/mcp/tasks')
  async mcpTasks(@Headers('authorization') authorization: string, @Query() query: any) {
    const orgId = await this.machineOrg(authorization);
    const tasks = await this.agentsService.listTasks(orgId, query);
    return tasks.map(compactTask);
  }

  @AllowAnonymous()
  @Get('agents/mcp/tasks/:ref')
  async mcpTask(@Headers('authorization') authorization: string, @Param('ref') ref: string) {
    const orgId = await this.machineOrg(authorization);
    return compactTask(await this.agentsService.getTask(orgId, ref));
  }

  @AllowAnonymous()
  @Post('agents/mcp/tasks')
  async mcpCreateTask(@Headers('authorization') authorization: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    const task = await this.agentsService.createTask(orgId, data);
    this.agentsGateway.emitTask(orgId, 'task:created', task);
    return compactTask(task);
  }

  @AllowAnonymous()
  @Patch('agents/mcp/tasks/:ref')
  async mcpUpdateTask(@Headers('authorization') authorization: string, @Param('ref') ref: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    const task = await this.agentsService.updateTask(orgId, ref, data);
    this.agentsGateway.emitTask(orgId, 'task:updated', task);
    return compactTask(task);
  }

  @AllowAnonymous()
  @Post('agents/mcp/tasks/:ref/comments')
  async mcpComment(@Headers('authorization') authorization: string, @Param('ref') ref: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    const task = await this.agentsService.commentTask(orgId, ref, data);
    this.agentsGateway.emitTask(orgId, 'task:updated', task);
    return compactTask(task);
  }

  @AllowAnonymous()
  @Post('agents/mcp/tasks/:ref/dispatch')
  async mcpDispatch(@Headers('authorization') authorization: string, @Param('ref') ref: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    const taskId = await this.agentsService.findTaskId(orgId, ref);
    const { task, ...job } = await this.agentsGateway.dispatchTask(orgId, taskId, data);
    return { taskId: job.taskId, agent: job.agent, projectPath: job.projectPath, task: compactTask(task) };
  }

  @AllowAnonymous()
  @Post('agents/mcp/tasks/:ref/stop')
  async mcpStop(@Headers('authorization') authorization: string, @Param('ref') ref: string) {
    const orgId = await this.machineOrg(authorization);
    const taskId = await this.agentsService.findTaskId(orgId, ref);
    return this.agentsGateway.stopTask(orgId, taskId);
  }

  @AllowAnonymous()
  @Get('agents/mcp/team/messages')
  async mcpTeamMessages(@Headers('authorization') authorization: string, @Query() query: any) {
    const orgId = await this.machineOrg(authorization);
    const messages = await this.agentsService.listTeamChat(orgId, query);
    return messages.map((m) => ({ from: m.agent, to: m.targetAgent || 'team', taskId: m.taskId, content: m.content, createdAt: m.createdAt }));
  }

  @AllowAnonymous()
  @Post('agents/mcp/team/messages')
  async mcpSendTeamMessage(@Headers('authorization') authorization: string, @Body() data: any) {
    const orgId = await this.machineOrg(authorization);
    const message = await this.agentsGateway.sendTeamMessage(orgId, data?.agent, data);
    return { id: message.id, from: message.agent, to: message.targetAgent || 'team', taskId: message.taskId };
  }

  private async machineOrg(authorization: string | undefined) {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    const orgId = await this.agentsService.findOrgByMachineToken(token);
    if (!orgId) throw new UnauthorizedException('Chave da máquina inválida');
    return orgId;
  }
}
