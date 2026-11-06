-- CreateTable
CREATE TABLE "agent_chat_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "project_path" TEXT,
    "task_id" TEXT,
    "external_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "agent_chat_messages" ADD COLUMN "session_id" TEXT;

-- CreateIndex
CREATE INDEX "agent_chat_sessions_organization_id_agent_user_id_idx" ON "agent_chat_sessions"("organization_id", "agent", "user_id");

-- CreateIndex
CREATE INDEX "agent_chat_sessions_organization_id_updated_at_idx" ON "agent_chat_sessions"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "agent_chat_messages_organization_id_session_id_idx" ON "agent_chat_messages"("organization_id", "session_id");

-- AddForeignKey
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversas antigas do Chat Lateral viram uma sessão por usuário e agente
INSERT INTO "agent_chat_sessions" ("id", "organization_id", "user_id", "agent", "title", "active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "organization_id", "owner_id", "agent", 'Conversa anterior', false, MIN("created_at"), MAX("created_at")
FROM "agent_chat_messages"
WHERE "owner_id" IN (SELECT "id" FROM "user")
GROUP BY "organization_id", "owner_id", "agent";

UPDATE "agent_chat_messages" m SET "session_id" = s."id"
FROM "agent_chat_sessions" s
WHERE s."organization_id" = m."organization_id" AND s."user_id" = m."owner_id" AND s."agent" = m."agent";
