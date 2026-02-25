import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('tasks')
export class TasksController {
    constructor(private readonly tasksService: TasksService) { }

    @Post()
    create(@ActiveOrg() orgId: string, @Body() data: any) {
        return this.tasksService.create(orgId, data);
    }

    @Get()
    findAll(@ActiveOrg() orgId: string) {
        return this.tasksService.findAll(orgId);
    }

    @Get(':id')
    findOne(@ActiveOrg() orgId: string, @Param('id') id: string) {
        return this.tasksService.findOne(id, orgId);
    }

    @Put(':id')
    update(@ActiveOrg() orgId: string, @Param('id') id: string, @Body() data: any) {
        return this.tasksService.update(id, orgId, data);
    }

    @Delete(':id')
    remove(@ActiveOrg() orgId: string, @Param('id') id: string) {
        return this.tasksService.remove(id, orgId);
    }
}
