import { Module } from '@nestjs/common';
import { ReportModule } from './modules/report/report.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
    }),
    ReportModule,
    SettingsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
