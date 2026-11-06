import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';

// Tipo de cada extensão aceita. O tipo enviado pelo navegador não é usado
const mimeTypes: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.json': 'application/json',
    '.diff': 'text/x-diff',
};

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

const uploadsRoot = path.resolve(process.env.UPLOADS_DIR || 'uploads');

export interface UploadedAttachment {
    originalname: string;
    buffer: Buffer;
    size: number;
}

@Injectable()
export class AttachmentsService {
    constructor(private prisma: PrismaService) { }

    async list(organizationId: string, taskId: string) {
        return this.prisma.taskAttachment.findMany({
            where: { taskId, companyId: organizationId },
            select: { id: true, filename: true, size: true, mimeType: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    async upload(organizationId: string, taskId: string, file: UploadedAttachment | undefined) {
        if (!file) throw new BadRequestException('Envie o arquivo no campo file');

        // O multer lê o nome em latin1, o navegador manda em utf8
        const filename = path.basename(Buffer.from(file.originalname, 'latin1').toString('utf8')).slice(0, 200);
        const mimeType = mimeTypes[path.extname(filename).toLowerCase()];
        if (!mimeType) throw new BadRequestException('Formato não aceito. Use: ' + Object.keys(mimeTypes).join(', '));
        if (file.size > MAX_ATTACHMENT_SIZE) throw new BadRequestException('Arquivo maior que 25MB');

        const task = await this.prisma.task.findFirst({ where: { id: taskId, companyId: organizationId }, select: { id: true } });
        if (!task) throw new NotFoundException('Task not found');

        const id = randomUUID();
        const relativePath = path.join('attachments', organizationId, task.id, `${id}-${filename.replace(/[^\w.-]/g, '_')}`);
        const absolutePath = path.join(uploadsRoot, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, file.buffer);

        return this.prisma.taskAttachment.create({
            data: { id, companyId: organizationId, taskId: task.id, filename, path: relativePath, size: file.size, mimeType },
            select: { id: true, filename: true, size: true, mimeType: true, createdAt: true },
        });
    }

    // Caminho no disco só de anexo da tarefa e da organização
    async find(organizationId: string, taskId: string, attachmentId: string) {
        const attachment = await this.prisma.taskAttachment.findFirst({
            where: { id: attachmentId, taskId, companyId: organizationId },
        });
        if (!attachment) throw new NotFoundException('Anexo não encontrado');

        const absolutePath = path.join(uploadsRoot, attachment.path);
        if (!absolutePath.startsWith(uploadsRoot + path.sep)) throw new NotFoundException('Anexo não encontrado');
        return { ...attachment, absolutePath };
    }

    async remove(organizationId: string, taskId: string, attachmentId: string) {
        const attachment = await this.find(organizationId, taskId, attachmentId);
        await this.prisma.taskAttachment.deleteMany({ where: { id: attachment.id, taskId, companyId: organizationId } });
        await rm(attachment.absolutePath, { force: true });
        return { id: attachment.id };
    }
}
