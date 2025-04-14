import { Injectable } from '@nestjs/common';
import { WhatsappManagerAdapter } from '../../adapters/whatsapp-manager-adapter';

@Injectable()
export class SettingsService {
  constructor(private readonly whatsappManagerApi: WhatsappManagerAdapter) {}

  async createInstance() {
    return this.whatsappManagerApi.createInstance();
  }

  async getInstanceInfo() {
    return this.whatsappManagerApi.getInstanceInfo();
  }

  async scanQrcode() {
    return this.whatsappManagerApi.scanQrcode();
  }

  async connectInstance() {
    return this.whatsappManagerApi.connectInstance();
  }

  async restartInstance() {
    return this.whatsappManagerApi.restartInstance();
  }
}
