-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('kg', 'lb');

-- CreateEnum
CREATE TYPE "LiftId" AS ENUM ('SQ', 'DL', 'BP', 'OHP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "auth0Id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "defaultUnit" "WeightUnit" NOT NULL DEFAULT 'kg',
    "defaultBarbellKg" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "defaultBarbellLb" DECIMAL(65,30) NOT NULL DEFAULT 45,
    "cycleIncrement531" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "preferredUnit" "WeightUnit",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "feelingScore" INTEGER,
    "feelingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSet" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "liftId" "LiftId",
    "setNumber" INTEGER NOT NULL,
    "repsTarget" INTEGER NOT NULL,
    "repsDone" INTEGER,
    "percentage" DECIMAL(65,30),
    "isAmrap" BOOLEAN NOT NULL DEFAULT false,
    "targetWeight" DECIMAL(65,30) NOT NULL,
    "barbellWeight" DECIMAL(65,30),
    "perSideWeight" DECIMAL(65,30),
    "e1rm" DECIMAL(65,30),
    "amrapStatus" TEXT,
    "amrapLoggedAt" TIMESTAMP(3),
    "unit" "WeightUnit" NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "setFeelingScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training531Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liftId" "LiftId" NOT NULL,
    "oneRm" DECIMAL(65,30) NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "unit" "WeightUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training531Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0Id_key" ON "User"("auth0Id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ExerciseSet_sessionId_idx" ON "ExerciseSet"("sessionId");

-- CreateIndex
CREATE INDEX "ExerciseSet_exerciseId_idx" ON "ExerciseSet"("exerciseId");

-- CreateIndex
CREATE INDEX "ExerciseSet_liftId_createdAt_idx" ON "ExerciseSet"("liftId", "createdAt");

-- CreateIndex
CREATE INDEX "UserActivityLog_userId_createdAt_idx" ON "UserActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Training531Profile_userId_idx" ON "Training531Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Training531Profile_userId_liftId_key" ON "Training531Profile"("userId", "liftId");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSet" ADD CONSTRAINT "ExerciseSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSet" ADD CONSTRAINT "ExerciseSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivityLog" ADD CONSTRAINT "UserActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training531Profile" ADD CONSTRAINT "Training531Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
