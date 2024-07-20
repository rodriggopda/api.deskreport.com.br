import { randomUUID } from 'crypto';
import { CreateReportDto } from './dto/create-report.dto';
import { GetReportDto } from './dto/get-report.dto';

export class ReportRepository {
  reports: any = [
    {
      id: '1',
      public_id: randomUUID(),
      title: 'Criar mock de reports no repositório',
      status: 'under-analysis'
    },
    {
      id: '2',
      public_id: randomUUID(),
      title: 'Testar endpoints de busca de todos os reports e busca por id',
      status: 'under-analysis'
    },
    {
      id: '3',
      public_id: randomUUID(),
      title: 'Alterar nome do módulo \'task\' para \'reports\'',
      status: 'under-analysis'
    },
    {
      id: '4',
      public_id: randomUUID(),
      title: 'Fazer commit das alterações',
      status: 'under-analysis'
    },
  ];

  getAll() {
    const reports: GetReportDto[] = this.reports.sort((a, b) => b.id.localeCompare(a.id));
    return Promise.resolve(reports);
  }

  get(reportId: string) {
    const report: GetReportDto = this.reports.find(
      (report) => report.public_id == reportId,
    );
    return Promise.resolve(report);
  }

  create(report: CreateReportDto) {
    report.id = String(this.reports.length + 1)
    this.reports.push(report);
  }
}
