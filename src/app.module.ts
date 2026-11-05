import { Module } from '@nestjs/common';
import { SettingsModule } from './modules/settings/settings.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { BillingModule } from './modules/billing/billing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BackupModule } from './modules/backup/backup.module';
import { AgentsModule } from './modules/agents/agents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SettingsModule,
    PrismaModule,
    TasksModule,
    AuthModule,
    ProjectsModule,
    DashboardModule,
    TeamsModule,
    UsersModule,
    NotificationsModule,
    IntegrationsModule,
    BillingModule,
    ReportsModule,
    BackupModule,
    AgentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
