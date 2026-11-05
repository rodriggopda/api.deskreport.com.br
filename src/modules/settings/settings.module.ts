import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { WhatsappManagerAdapter } from '../../adapters/whatsapp-manager-adapter';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [WhatsappManagerAdapter, SettingsService],
})
export class SettingsModule { }
