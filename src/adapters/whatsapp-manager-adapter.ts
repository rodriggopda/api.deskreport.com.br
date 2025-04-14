import * as process from 'node:process';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsappManagerAdapter {
  private managerApi = process.env.SERVER_URL;
  private authenticationApiKey = process.env.AUTHENTICATION_API_KEY;

  constructor() {
    console.log('loaded keys', this.managerApi, this.authenticationApiKey);
  }

  createInstance() {
    const instancePayload = {
      instanceName: 'Develop',
      integration: 'WHATSAPP-BAILEYS',
      number: '44997348104',
      qrcode: true,
    };
    return this.fetchAdapter('POST', '/instance/create', instancePayload);
  }

  scanQrcode() {
    return this.fetchAdapter('GET', '/instance/connect/Develop');
  }

  connectInstance() {}

  async getInstanceInfo() {
    const instance = await this.fetchAdapter(
      'GET',
      '/instance/fetchInstances?instanceName=Develop',
    );
    if (!instance.length) {
      return;
    }
    return instance[0];
  }

  restartInstance() {
    return this.fetchAdapter('POST', '/instance/restart/Develop');
  }

  async fetchAdapter(method: 'POST' | 'PUT' | 'GET', uri: string, body?: any) {
    return fetch(this.managerApi + uri, {
      method,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        apikey: this.authenticationApiKey,
      },
    }).then(async (data) => {
      return data.json();
    });
  }
}
