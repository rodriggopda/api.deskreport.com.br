-- CreateTable
CREATE TABLE "agent_chat_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_chat_messages_organization_id_agent_owner_id_idx" ON "agent_chat_messages"("organization_id", "agent", "owner_id");

-- AddForeignKey
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
