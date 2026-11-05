import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ProjectsService, CreateProjectDto } from './projects.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('projects')
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) { }

    @Post()
    create(@ActiveOrg() orgId: string, @Body() data: CreateProjectDto) {
        return this.projectsService.create(orgId, data);
    }

    @Get()
    findAll(@ActiveOrg() orgId: string) {
        return this.projectsService.findAll(orgId);
    }

    @Get(':id')
    findOne(@ActiveOrg() orgId: string, @Param('id') id: string) {
        return this.projectsService.findOne(id, orgId);
    }

    @Put(':id')
    update(@ActiveOrg() orgId: string, @Param('id') id: string, @Body() data: Partial<CreateProjectDto>) {
        return this.projectsService.update(id, orgId, data);
    }

    @Delete(':id')
    remove(@ActiveOrg() orgId: string, @Param('id') id: string) {
        return this.projectsService.remove(id, orgId);
    }
}
