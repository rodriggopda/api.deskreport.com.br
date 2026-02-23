import { betterAuth } from 'better-auth';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { organization } from 'better-auth/plugins';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
    database: prisma,
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        organization()
    ]
});
