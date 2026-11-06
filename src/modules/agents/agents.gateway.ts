import { BadRequestException } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { Server, Socket } from 'socket.io';
import { auth } from '../../auth/auth';
import { allowedOrigins } from '../../origins';
import { AgentsService, agentNames, checkProjectPath } from './agents.service';

// A autenticação é feita na conexão (chave da máquina ou sessão do navegador), por isso o guard global fica de fora
@AllowAnonymous()
@WebSocketGateway({ cors: { origin: allowedOrigins, credentials: true } })
export class AgentsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private agentsService: AgentsService) { }

  async handleConnection(client: Socket) {
    try {
      const machineToken = client.handshake.auth?.machineToken;
      if (machineToken) {
        const organizationId = await this.agentsService.findOrgByMachineToken(machineToken);
        if (!organizationId) return client.disconnect(true);

        client.data = { kind: 'machine', organizationId, agents: client.handshake.auth?.agents };
        client.join(machineRoom(organizationId));
        await this.syncAgents(organizationId);
        return;
      }

      const organizationId = client.handshake.auth?.organizationId || client.handshake.query?.organizationId;
      if (typeof organizationId !== 'string') return client.disconnect(true);

      const session = await auth.api.getSession({ headers: fromNodeHeaders(client.handshake.headers) });
      if (!session || !(await this.agentsService.isMember(organizationId, session.user.id))) {
        return client.disconnect(true);
      }

      client.data = { kind: 'ui', organizationId };
      client.join(uiRoom(organizationId));
      client.join(userRoom(organizationId, session.user.id));
      client.emit('agent:status-list', await this.agentsService.statusList(organizationId));
      client.emit('agent:task-logs', this.agentsService.logsByOrg(organizationId));
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('machine:agents')
  async machineAgents(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    client.data.agents = data?.agents;
    await this.syncAgents(client.data.organizationId);
  }

  // Cada máquina diz quais agentes usa, a organização fica com a soma das máquinas conectadas
  async syncAgents(organizationId: string) {
    const sockets = await this.server.in(machineRoom(organizationId)).fetchSockets();
    const lists = sockets.map((socket) => socket.data?.agents).filter((agents) => Array.isArray(agents));
    if (lists.length === 0) return;

    await this.agentsService.setEnabledAgents(organizationId, lists.flat());
    this.server.to(uiRoom(organizationId)).emit('agent:status-list', await this.agentsService.statusList(organizationId));
  }

  @SubscribeMessage('machine:roles-updated')
  async machineRoles(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    await this.agentsService.saveMachineRoles(client.data.organizationId, client.handshake.auth?.machineToken, data?.roles);
  }

  @SubscribeMessage('machine:telemetry')
  telemetry(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    const organizationId = client.data.organizationId;
    const status = this.agentsService.saveStatus(organizationId, data);
    if (status) this.server.to(uiRoom(organizationId)).emit('agent:status', status);
  }

  // Saída do terminal do agente, vai para o painel da organização em tempo real
  @SubscribeMessage('machine:task-output')
  taskOutput(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    const output = this.agentsService.appendOutput(client.data.organizationId, data);
    if (output) this.server.to(uiRoom(client.data.organizationId)).emit('agent:task-output', output);
  }

  @SubscribeMessage('machine:task-finished')
  async taskFinished(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    const organizationId = client.data.organizationId;
    const task = await this.agentsService.finishTask(organizationId, data);
    if (task) this.server.to(uiRoom(organizationId)).emit('task:updated', task);

    const status = this.agentsService.saveStatus(organizationId, { agent: data?.agent, state: 'idle' });
    if (status) this.server.to(uiRoom(organizationId)).emit('agent:status', status);
  }

  // Resposta do agente no Chat Lateral, só o dono da conversa recebe
  @SubscribeMessage('machine:chat-reply')
  async chatReply(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    const organizationId = client.data.organizationId;
    const message = await this.agentsService.saveChatReply(organizationId, data);
    if (message?.ownerId) this.server.to(userRoom(organizationId, message.ownerId)).emit('agent:chat-message', message);
  }

  // Resposta do agente que foi chamado na sala do time. Não acorda ninguém, para não virar conversa sem fim
  @SubscribeMessage('machine:team-reply')
  async teamReply(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    if (client.data?.kind !== 'machine') return;

    const organizationId = client.data.organizationId;
    try {
      const message = await this.agentsService.saveTeamMessage(organizationId, data?.agent, data);
      this.server.to(uiRoom(organizationId)).emit('agent:team-message', message);
    } catch {
      return;
    }
  }

  // Mensagem de um agente para outro (ou para o time). Com destino, a máquina roda o agente que recebeu
  async sendTeamMessage(organizationId: string, fromAgent: string, data: any) {
    const projectPath = data?.projectPath;
    checkProjectPath(projectPath);

    const message = await this.agentsService.saveTeamMessage(organizationId, fromAgent, data);
    this.server.to(uiRoom(organizationId)).emit('agent:team-message', message);

    if (message.targetAgent) {
      const history = await this.agentsService.listTeamChat(organizationId, { taskId: message.taskId, limit: 20 });
      this.server.to(machineRoom(organizationId)).emit('agent:team-message', {
        from: message.agent,
        to: message.targetAgent,
        taskId: message.taskId,
        projectPath,
        content: message.content,
        history: history.map((m) => ({ author: m.user.name, content: m.content })),
      });
    }
    return message;
  }

  // Humano autorizou o agente a seguir mesmo com a cota acima da margem de segurança
  continueQuota(organizationId: string, agent: string) {
    if (!agentNames.includes(agent)) throw new BadRequestException('agent deve ser um de: ' + agentNames.join(', '));

    this.server.to(machineRoom(organizationId)).emit('agent:quota-continue', { agent });
    return { agent };
  }

  // Salva a mensagem na sessão e manda a máquina rodar o agente. Com externalId a CLI retoma a própria conversa
  async sendSessionChat(organizationId: string, userId: string, sessionId: string, data: any) {
    if (!(await this.hasMachine(organizationId))) {
      throw new BadRequestException('Nenhuma máquina conectada. Suba o deskreport-client.');
    }

    const { message, session } = await this.agentsService.saveSessionMessage(organizationId, userId, sessionId, data);
    const history = await this.agentsService.listSessionMessages(organizationId, userId, session.id);
    this.server.to(userRoom(organizationId, userId)).emit('agent:chat-message', message);
    this.server.to(machineRoom(organizationId)).emit('agent:chat', {
      agent: session.agent,
      ownerId: userId,
      sessionId: session.id,
      externalId: session.externalId,
      projectPath: session.projectPath,
      content: message.content,
      history: history.slice(-21, -1).map((m) => ({ author: m.user.name, content: m.content })),
    });
    return { ...message, session };
  }

  async hasMachine(organizationId: string) {
    const sockets = await this.server.in(machineRoom(organizationId)).fetchSockets();
    return sockets.length > 0;
  }

  // Atribui o agente na tarefa e manda o deskreport-client abrir o agente com a spec
  async dispatchTask(organizationId: string, taskId: string, data: any) {
    if (!(await this.hasMachine(organizationId))) {
      throw new BadRequestException('Nenhuma máquina conectada. Suba o deskreport-client.');
    }

    const { task, ...job } = await this.agentsService.startDispatch(taskId, organizationId, data);
    if (job.mode === 'task') this.agentsService.clearOutput(organizationId, task.id);
    this.emitTask(organizationId, 'task:updated', task);
    this.server.to(machineRoom(organizationId)).emit('agent:dispatch', job);
    return { ...job, task };
  }

  // Manda a máquina matar o agente que roda a tarefa (ou tirar ela da fila)
  async stopTask(organizationId: string, taskId: string) {
    if (!(await this.hasMachine(organizationId))) {
      throw new BadRequestException('Nenhuma máquina conectada. Suba o deskreport-client.');
    }

    const id = await this.agentsService.findTaskToStop(taskId, organizationId);
    this.server.to(machineRoom(organizationId)).emit('agent:stop-task', { taskId: id });
    return { taskId: id };
  }

  // Avisa o painel da organização que uma tarefa mudou
  emitTask(organizationId: string, event: 'task:created' | 'task:updated', task: unknown) {
    this.server.to(uiRoom(organizationId)).emit(event, task);
  }
}

function machineRoom(organizationId: string) {
  return `org:${organizationId}:machines`;
}

function uiRoom(organizationId: string) {
  return `org:${organizationId}:ui`;
}

function userRoom(organizationId: string, userId: string) {
  return `org:${organizationId}:user:${userId}`;
}
