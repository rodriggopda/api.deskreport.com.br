import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubService } from './github.service';
import { GithubController } from './github.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    imports: [ConfigModule],
    providers: [GithubService, PrismaService],
    controllers: [GithubController],
    exports: [GithubService],
})
export class GithubModule { }
