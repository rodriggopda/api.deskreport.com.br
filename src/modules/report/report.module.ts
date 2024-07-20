import { Module } from '@nestjs/common';
import { ReportRepository } from './report.repository';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  controllers: [ReportController],
  providers: [ReportRepository, ReportService],
})
export class ReportModule {}