-- AlterTable
ALTER TABLE "agent_chat_messages" ALTER COLUMN "owner_id" DROP NOT NULL,
ADD COLUMN "target_agent" TEXT,
ADD COLUMN "task_id" TEXT;
