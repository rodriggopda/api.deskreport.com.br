import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { GithubController } from './github.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    providers: [GithubService, PrismaService],
    controllers: [GithubController],
    exports: [GithubService],
})
export class GithubModule { }
