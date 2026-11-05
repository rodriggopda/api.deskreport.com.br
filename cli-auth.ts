import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';

export const auth = betterAuth({
    database: {
        provider: "postgresql",
        url: process.env.DATABASE_URL
    },
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        organization()
    ]
});
