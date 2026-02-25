import { Injectable } from '@nestjs/common';
import { WhatsappManagerAdapter } from '../../adapters/whatsapp-manager-adapter';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SettingsService {
  constructor(
    private readonly whatsappManagerApi: WhatsappManagerAdapter,
    private readonly prisma: PrismaService
  ) { }

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

  async linkManualMember(orgId: string, userId: string, role: string) {
    // Add existing better-auth user onto Postgres Member table
    const createdMember = await this.prisma.member.create({
      data: {
        id: uuidv4(),
        organizationId: orgId,
        userId: userId,
        role: role,
        createdAt: new Date(),
      }
    });
    return { ok: true, member: createdMember };
  }
}
