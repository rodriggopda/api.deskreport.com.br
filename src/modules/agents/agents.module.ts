import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentsController } from './agents.controller';
import { AgentsGateway } from './agents.gateway';
import { AgentsService } from './agents.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsGateway],
  exports: [AgentsGateway, AgentsService],
})
export class AgentsModule { }
