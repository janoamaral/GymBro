/*
  Warnings:

  - The values [OHP] on the enum `LiftId` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LiftId_new" AS ENUM ('SQ', 'DL', 'BP');
ALTER TABLE "ExerciseSet" ALTER COLUMN "liftId" TYPE "LiftId_new" USING ("liftId"::text::"LiftId_new");
ALTER TABLE "Training531Profile" ALTER COLUMN "liftId" TYPE "LiftId_new" USING ("liftId"::text::"LiftId_new");
ALTER TYPE "LiftId" RENAME TO "LiftId_old";
ALTER TYPE "LiftId_new" RENAME TO "LiftId";
DROP TYPE "public"."LiftId_old";
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "restTimerSeconds" INTEGER NOT NULL DEFAULT 90;
