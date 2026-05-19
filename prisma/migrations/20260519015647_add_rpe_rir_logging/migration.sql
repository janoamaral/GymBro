-- AlterTable
ALTER TABLE "ExerciseSet" ADD COLUMN     "rir" INTEGER,
ADD COLUMN     "rpe" INTEGER;

-- CreateTable
CREATE TABLE "RpeLog" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "rpe" INTEGER NOT NULL,
    "rir" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RpeLog_setId_createdAt_idx" ON "RpeLog"("setId", "createdAt");

-- AddForeignKey
ALTER TABLE "RpeLog" ADD CONSTRAINT "RpeLog_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ExerciseSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
