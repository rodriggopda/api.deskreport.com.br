import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { ActiveOrg } from '../../auth/active-org.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) { }

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

  @Post('/members/link')
  async linkManualMember(@ActiveOrg() orgId: string, @Body() body: { userId: string, role: string }) {
    return this.settingsService.linkManualMember(orgId, body.userId, body.role);
  }

  @Get('/debug/make-admin')
  async makeAdmin() {
    await this.settingsService.makeAllUsersAdmins();
    return { ok: true, message: "Todos os usuários agora são administradores" };
  }

  // --- ROLES / PERMISSION PROFILES ---

  @Get('/roles')
  async getRoles(@ActiveOrg() orgId: string) {
    return this.settingsService.getPermissionProfiles(orgId);
  }

  @Post('/roles')
  async createRole(@ActiveOrg() orgId: string, @Body() body: { name: string, permissions: string[] }) {
    return this.settingsService.createPermissionProfile(orgId, body.name, body.permissions);
  }

  @Put('/roles/:id')
  async updateRole(@Param('id') id: string, @Body() body: { name: string, permissions: string[] }) {
    return this.settingsService.updatePermissionProfile(id, body.name, body.permissions);
  }

  @Delete('/roles/:id')
  async deleteRole(@Param('id') id: string) {
    return this.settingsService.deletePermissionProfile(id);
  }

  @Post('/roles/assign')
  async assignRole(@Body() body: { memberId: string, profileId: string | null }) {
    return this.settingsService.assignProfileToMember(body.memberId, body.profileId);
  }
}
