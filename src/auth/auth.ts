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
    plugins: [
        admin(),
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
