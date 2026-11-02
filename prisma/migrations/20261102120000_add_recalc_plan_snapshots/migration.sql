-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "originalPlan" JSONB;
ALTER TABLE "WorkoutSession" ADD COLUMN "recalculatedPlan" JSONB;
