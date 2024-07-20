import { CreateTaskDto } from './dto/create-task.dto';
import { GetTaskDto } from './dto/get-task.dto';

export class TaskRepository {
  tasks = [];

  getAll() {
    const tasks: GetTaskDto[] = this.tasks;
    return Promise.resolve(tasks);
  }

  get(taskId: string) {
    const task: GetTaskDto = this.tasks.find(
      (task) => task.public_id == taskId,
    );
    return Promise.resolve(task);
  }

  create(task: CreateTaskDto) {
    this.tasks.push(task);
  }
}
