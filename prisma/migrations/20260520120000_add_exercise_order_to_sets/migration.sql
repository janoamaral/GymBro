-- Add stable exercise ordering per workout session.
ALTER TABLE "ExerciseSet"
ADD COLUMN "exerciseOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ExerciseSet_sessionId_exerciseOrder_idx"
ON "ExerciseSet"("sessionId", "exerciseOrder");
