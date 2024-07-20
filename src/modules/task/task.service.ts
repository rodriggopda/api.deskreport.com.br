import { TaskRepository } from './task.repository';
import { Injectable } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  getAll() {
    return this.repository.getAll();
  }

  get(taskId: string) {
    if (!taskId) return;
    return this.repository.get(taskId);
  }

  create(taskDto: CreateTaskDto) {
    this.repository.create(taskDto);
  }
}
