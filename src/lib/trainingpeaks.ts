import { WorkoutStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TrainingPeaksExportResult = {
  externalId: string;
  payload: Record<string, unknown>;
};

export interface TrainingPeaksAdapter {
  exportWorkout(userId: string, workoutId: string): Promise<TrainingPeaksExportResult>;
}

type WorkoutSegmentExportInput = {
  label: string;
  durationMin: number;
  zoneName: string;
  paceMinSecPerKm: number;
  paceMaxSecPerKm: number;
  heartRateMinBpm: number;
  heartRateMaxBpm: number;
  intensity: string;
  notes: string | null;
};

export function buildMockTrainingPeaksPayload(workout: {
  id: string;
  date: Date;
  title: string;
  sport: string;
  goal: string;
  durationMin: number;
  zoneName: string;
  intensity: string;
  structure: string;
  notes: string | null;
  segments?: WorkoutSegmentExportInput[];
}) {
  return {
    workoutId: workout.id,
    scheduledDate: workout.date.toISOString().slice(0, 10),
    title: workout.title,
    sport: workout.sport,
    goal: workout.goal,
    durationMinutes: workout.durationMin,
    intensity: workout.intensity,
    zone: workout.zoneName,
    description: workout.structure,
    notes: workout.notes,
    segments: workout.segments?.map((segment, index) => ({
      order: index + 1,
      label: segment.label,
      durationMinutes: segment.durationMin,
      zone: segment.zoneName,
      paceSecondsPerKm: {
        min: segment.paceMinSecPerKm,
        max: segment.paceMaxSecPerKm
      },
      heartRateBpm: {
        min: segment.heartRateMinBpm,
        max: segment.heartRateMaxBpm
      },
      intensity: segment.intensity,
      notes: segment.notes
    })),
    provider: "TrainingPeaks",
    mode: "mock"
  };
}

export class MockTrainingPeaksAdapter implements TrainingPeaksAdapter {
  async exportWorkout(userId: string, workoutId: string) {
    const workout = await prisma.workout.findFirstOrThrow({
      where: {
        id: workoutId,
        userId
      },
      include: {
        segments: {
          orderBy: { sortOrder: "asc" }
        }
      }
    });
    const payload = buildMockTrainingPeaksPayload(workout);
    const externalId = `mock-tp-${workout.id}`;

    await prisma.$transaction([
      prisma.exportAttempt.create({
        data: {
          userId,
          workoutId: workout.id,
          status: "SUCCESS",
          externalId,
          payload: JSON.stringify(payload)
        }
      }),
      prisma.workout.update({
        where: { id: workout.id },
        data: { status: WorkoutStatus.EXPORTED }
      })
    ]);

    return {
      externalId,
      payload
    };
  }
}

export class RealTrainingPeaksAdapter implements TrainingPeaksAdapter {
  async exportWorkout(): Promise<TrainingPeaksExportResult> {
    throw new Error("Realna integracja TrainingPeaks jest poza zakresem MVP.");
  }
}
