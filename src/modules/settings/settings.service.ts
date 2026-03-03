import { Injectable } from '@nestjs/common';
import { WhatsappManagerAdapter } from '../../adapters/whatsapp-manager-adapter';
import { PrismaService } from '../../prisma/prisma.service';


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
    // Verifica se já existe o vínculo
    const existingMember = await this.prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: userId
        }
      }
    });

    if (existingMember) {
      return { ok: true, member: existingMember, message: "Membro já vinculado" };
    }

    const createdMember = await this.prisma.member.create({
      data: {
        organizationId: orgId,
        userId: userId,
        role: role,
        createdAt: new Date(),
      }
    });
    return { ok: true, member: createdMember };
  }

  async makeAllUsersAdmins() {
    await this.prisma.user.updateMany({
      data: { role: 'admin' }
    });
  }

  // --- PERMISSION PROFILES (ROLES) ---

  async createPermissionProfile(orgId: string, name: string, permissions: string[]) {
    return this.prisma.permissionProfile.create({
      data: {
        organizationId: orgId,
        name,
        permissions
      }
    });
  }

  async getPermissionProfiles(orgId: string) {
    return this.prisma.permissionProfile.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: { members: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async updatePermissionProfile(id: string, name: string, permissions: string[]) {
    return this.prisma.permissionProfile.update({
      where: { id },
      data: { name, permissions }
    });
  }

  async deletePermissionProfile(id: string) {
    return this.prisma.permissionProfile.delete({
      where: { id }
    });
  }

  async assignProfileToMember(memberId: string, profileId: string | null) {
    return this.prisma.member.update({
      where: { id: memberId },
      data: { roleProfileId: profileId }
    });
  }
}
