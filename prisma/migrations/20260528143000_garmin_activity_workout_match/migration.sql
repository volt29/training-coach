-- AlterTable
ALTER TABLE "GarminActivity" ADD COLUMN "workoutId" TEXT REFERENCES "Workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "GarminActivity_workoutId_idx" ON "GarminActivity"("workoutId");
