import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  @Get('')
  getAll() {
    return this.service.getAll();
  }

  @Get(':id')
  get(@Param('id') reportId: string) {
    return this.service.get(reportId);
  }

  @Post()
  create(@Body() reportDto: CreateReportDto) {
    this.service.create(reportDto);
  }
}
