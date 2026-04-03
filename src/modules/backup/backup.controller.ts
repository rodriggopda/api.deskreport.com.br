import { Controller, Get, Post, Body } from '@nestjs/common';
import { BackupService } from './backup.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  export(@ActiveOrg() orgId: string) {
    return this.backupService.exportAll(orgId);
  }

  @Post('import')
  import(@ActiveOrg() orgId: string, @Body() backupData: any) {
    return this.backupService.importAll(orgId, backupData);
  }
}
