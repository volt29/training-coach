CREATE TABLE "WorkoutSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "zoneName" TEXT NOT NULL,
    "paceMinSecPerKm" INTEGER NOT NULL,
    "paceMaxSecPerKm" INTEGER NOT NULL,
    "heartRateMinBpm" INTEGER NOT NULL,
    "heartRateMaxBpm" INTEGER NOT NULL,
    "intensity" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "WorkoutSegment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorkoutSegment_workoutId_sortOrder_idx" ON "WorkoutSegment"("workoutId", "sortOrder");
