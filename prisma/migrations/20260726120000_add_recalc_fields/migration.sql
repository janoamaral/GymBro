-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "recalculationVersion" INTEGER;
ALTER TABLE "WorkoutSession" ADD COLUMN "recalcReason" TEXT;

-- AlterTable
ALTER TABLE "ExerciseSet" ADD COLUMN "isOriginalPlan" BOOLEAN NOT NULL DEFAULT false;