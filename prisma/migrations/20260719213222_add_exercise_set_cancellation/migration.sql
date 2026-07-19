-- AlterTable
ALTER TABLE "ExerciseSet" ADD COLUMN     "cancelReasonCode" INTEGER,
ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false;
