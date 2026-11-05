import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [PrismaModule, AgentsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule { }
