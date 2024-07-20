import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';

@Controller('tasks')
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @Get('')
  getAll() {
    return this.service.getAll();
  }

  @Get(':id')
  get(@Param('id') taskId: string) {
    return this.service.get(taskId);
  }

  @Post()
  create(@Body() taskDto: CreateTaskDto) {
    this.service.create(taskDto);
  }
}
