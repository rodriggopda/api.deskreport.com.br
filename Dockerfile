FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# O postinstall roda prisma generate, que lê o prisma.config.ts e pede DATABASE_URL (valor real vem do compose)
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm install --frozen-lockfile

COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build

CMD ["sh", "-c", "pnpm db:deploy && node dist/main"]
