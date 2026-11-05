-- CreateTable
CREATE TABLE "agent_machines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "workspace_root" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_machines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_machines_token_hash_key" ON "agent_machines"("token_hash");

-- CreateIndex
CREATE INDEX "agent_machines_organization_id_idx" ON "agent_machines"("organization_id");

