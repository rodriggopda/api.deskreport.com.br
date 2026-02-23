import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';

export const auth = betterAuth({
    database: {
        provider: "postgresql",
        url: "postgresql://neondb_owner:npg_h1GbYUE3mZKc@ep-lucky-glade-aigloact-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    },
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        organization()
    ]
});
