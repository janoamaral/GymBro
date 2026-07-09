-- Setup time before each time-based set (Dead Hang, etc).
ALTER TABLE "User"
ADD COLUMN "setupTimeSeconds" INTEGER NOT NULL DEFAULT 15;