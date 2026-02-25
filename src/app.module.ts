import { Module } from '@nestjs/common';
import { SettingsModule } from './modules/settings/settings.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
    }),
    SettingsModule,
    PrismaModule,
    TasksModule,
    AuthModule,
    ProjectsModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
