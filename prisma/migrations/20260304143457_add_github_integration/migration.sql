-- CreateTable
CREATE TABLE "github_integrations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "github_owner" TEXT NOT NULL,
    "github_repo" TEXT,
    "github_project_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_integrations_project_id_key" ON "github_integrations"("project_id");

-- AddForeignKey
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
