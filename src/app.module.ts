import { Module } from '@nestjs/common';
import { SettingsModule } from './modules/settings/settings.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TeamsModule } from './modules/teams/teams.module';
import { GithubModule } from './modules/github/github.module';

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
    GithubModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
