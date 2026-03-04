import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('teams')
export class TeamsController {
    constructor(private readonly teamsService: TeamsService) { }

    @Post()
    create(@ActiveOrg() orgId: string, @Body() data: any) {
        return this.teamsService.create(orgId, data);
    }

    @Get()
    findAll(@ActiveOrg() orgId: string) {
        return this.teamsService.findAll(orgId);
    }

    @Get(':id')
    findOne(@ActiveOrg() orgId: string, @Param('id') id: string) {
        return this.teamsService.findOne(id, orgId);
    }

    @Put(':id')
    update(@ActiveOrg() orgId: string, @Param('id') id: string, @Body() data: any) {
        return this.teamsService.update(id, orgId, data);
    }

    @Delete(':id')
    remove(@ActiveOrg() orgId: string, @Param('id') id: string) {
        return this.teamsService.remove(id, orgId);
    }
}
