import { Controller, Get, Post } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post('/instance/create')
  async createInstance() {
    return this.settingsService.createInstance();
  }

  @Get('/instance/info')
  async getInstanceInfo() {
    return this.settingsService.getInstanceInfo();
  }

  @Get('/instance/scan-qrcode')
  async scanQrcode() {
    return this.settingsService.scanQrcode();
  }

  @Post('/instance/connect')
  async connectInstance() {
    return this.settingsService.connectInstance();
  }

  @Post('/instance/restart')
  async restartInstance() {
    return this.settingsService.restartInstance();
  }
}
