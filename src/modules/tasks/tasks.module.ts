import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentsModule } from '../agents/agents.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [PrismaModule, AgentsModule],
  controllers: [TasksController, AttachmentsController],
  providers: [TasksService, AttachmentsService],
})
export class TasksModule { }
