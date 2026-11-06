import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { admin, organization } from 'better-auth/plugins';
import 'dotenv/config';
import { allowedOrigins } from '../origins';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    advanced: {
        database: {
            generateId: "uuid"
        }
    },
    trustedOrigins: allowedOrigins,
    emailAndPassword: {
        enabled: true,
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Usuários de sistema dos agentes não criam organizações próprias
                    if (user.id.startsWith('agent-user-') || user.email.endsWith('@agents.deskreport.com.br')) return;

                    // Todo novo usuário humano cria a sua própria organização isolada como owner
                    const safeSlug = (user.name || 'workspace')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]/g, '-')
                        .replace(/-+/g, '-')
                        .slice(0, 20) + '-' + Math.random().toString(36).slice(2, 6);

                    const org = await prisma.organization.create({
                        data: {
                            name: `Workspace de ${user.name || user.email.split('@')[0]}`,
                            slug: safeSlug,
                            createdAt: new Date(),
                        },
                    });

                    await prisma.member.create({
                        data: {
                            organizationId: org.id,
                            userId: user.id,
                            role: 'owner',
                            createdAt: new Date(),
                        },
                    });
                },
            },
        },
    },
    plugins: [
        admin({
            isAuthorized: async (session) => {
                // 1. Se for admin global, permite sempre
                if (session.user.role === 'admin') return true;

                // 2. Se for Owner ou Admin de uma organização, permite criar usuários
                const member = await prisma.member.findFirst({
                    where: {
                        userId: session.user.id,
                        role: { in: ['owner', 'admin'] }
                    }
                });

                return !!member;
            }
        } as any),
        organization()
    ],
    organization: {
        additionalFields: {
            metadata: {
                type: "string",
                required: false,
            }
        }
    }
});
