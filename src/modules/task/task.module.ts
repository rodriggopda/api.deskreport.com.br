import { Module } from '@nestjs/common';
import { TaskRepository } from './task.repository';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

@Module({
  controllers: [TaskController],
  providers: [TaskRepository, TaskService],
})
export class TaskModule {}