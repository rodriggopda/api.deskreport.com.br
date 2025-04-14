import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { WhatsappManagerAdapter } from '../../adapters/whatsapp-manager-adapter';

@Module({
  imports: [],
  controllers: [SettingsController],
  providers: [WhatsappManagerAdapter, SettingsService],
})
export class SettingsModule {}
