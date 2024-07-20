import { ReportRepository } from './report.repository';
import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  getAll() {
    return this.repository.getAll();
  }

  get(reportId: string) {
    if (!reportId) return;
    return this.repository.get(reportId);
  }

  create(reportDto: CreateReportDto) {
    reportDto.status = 'under-analysis'
    this.repository.create(reportDto);
  }
}
