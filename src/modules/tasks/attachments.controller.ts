import { Controller, Delete, Get, Headers, Param, Post, Res, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Response } from 'express';
import { ActiveOrg } from '../../auth/active-org.decorator';
import { AgentsService } from '../agents/agents.service';
import { AttachmentsService, MAX_ATTACHMENT_SIZE, UploadedAttachment } from './attachments.service';

@Controller()
export class AttachmentsController {
    constructor(
        private attachmentsService: AttachmentsService,
        private agentsService: AgentsService,
    ) { }

    @Get('tasks/:taskId/attachments')
    list(@ActiveOrg() orgId: string, @Param('taskId') taskId: string) {
        return this.attachmentsService.list(orgId, taskId);
    }

    @Post('tasks/:taskId/attachments')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 } }))
    upload(@ActiveOrg() orgId: string, @Param('taskId') taskId: string, @UploadedFile() file: UploadedAttachment) {
        return this.attachmentsService.upload(orgId, taskId, file);
    }

    @Get('tasks/:taskId/attachments/:attachmentId/download')
    async download(@ActiveOrg() orgId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
        await this.send(res, orgId, taskId, attachmentId);
    }

    @Delete('tasks/:taskId/attachments/:attachmentId')
    remove(@ActiveOrg() orgId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string) {
        return this.attachmentsService.remove(orgId, taskId, attachmentId);
    }

    // O deskreport-client baixa os anexos com a chave da máquina antes de abrir o agente
    @AllowAnonymous()
    @Get('agents/mcp/tasks/:taskId/attachments/:attachmentId/download')
    async machineDownload(
        @Headers('authorization') authorization: string,
        @Param('taskId') taskId: string,
        @Param('attachmentId') attachmentId: string,
        @Res() res: Response,
    ) {
        const orgId = await this.agentsService.findOrgByMachineToken(authorization?.replace(/^Bearer\s+/i, ''));
        if (!orgId) throw new UnauthorizedException('Chave da máquina inválida');
        await this.send(res, orgId, taskId, attachmentId);
    }

    private async send(res: Response, orgId: string, taskId: string, attachmentId: string) {
        const attachment = await this.attachmentsService.find(orgId, taskId, attachmentId);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.download(attachment.absolutePath, attachment.filename, { headers: { 'Content-Type': attachment.mimeType } }, (error) => {
            if (error && !res.headersSent) res.status(404).json({ message: 'Arquivo não encontrado' });
        });
    }
}
