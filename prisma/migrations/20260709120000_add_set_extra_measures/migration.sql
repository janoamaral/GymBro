-- Time-based holds (e.g. Dead Hang) and distance-based carries (e.g. Farmer's Carry).
-- bodyweight is represented by targetWeight = 0 (no schema change needed for that).
ALTER TABLE "ExerciseSet"
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "distanceMeters" DECIMAL(8,2);