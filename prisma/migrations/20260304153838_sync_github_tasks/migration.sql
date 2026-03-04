-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'local';
