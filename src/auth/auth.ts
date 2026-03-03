import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { admin, organization } from 'better-auth/plugins';
import 'dotenv/config';

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
    trustedOrigins: [
        "http://10.0.0.150:5173",
        "http://10.0.0.150:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    emailAndPassword: {
        enabled: true,
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Busca a primeira organização do sistema
                    const firstOrg = await prisma.organization.findFirst();
                    if (firstOrg) {
                        // Se existir uma organização, vincula o novo usuário a ela como 'member'
                        await prisma.member.create({
                            data: {
                                organizationId: firstOrg.id,
                                userId: user.id,
                                role: 'member',
                                createdAt: new Date()
                            }
                        });
                        console.log(`Usuário ${user.email} vinculado automaticamente à organização ${firstOrg.name}`);
                    }
                }
            }
        }
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
