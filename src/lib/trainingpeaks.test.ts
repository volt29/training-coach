import { describe, expect, it } from "vitest";

import { buildMockTrainingPeaksPayload } from "@/lib/trainingpeaks";

describe("buildMockTrainingPeaksPayload", () => {
  it("maps a workout to a TrainingPeaks-shaped mock payload", () => {
    const payload = buildMockTrainingPeaksPayload({
      id: "workout-1",
      date: new Date("2026-05-17T00:00:00.000Z"),
      title: "Długi bieg",
      sport: "run",
      goal: "longRun",
      durationMin: 90,
      zoneName: "Z2",
      intensity: "umiarkowana",
      structure: "90 min spokojnie",
      notes: null,
      segments: [
        {
          label: "Dlugie Z2",
          durationMin: 90,
          zoneName: "Z2",
          paceMinSecPerKm: 330,
          paceMaxSecPerKm: 389,
          heartRateMinBpm: 138,
          heartRateMaxBpm: 151,
          intensity: "umiarkowana",
          notes: null
        }
      ]
    });

    expect(payload).toMatchObject({
      workoutId: "workout-1",
      scheduledDate: "2026-05-17",
      provider: "TrainingPeaks",
      mode: "mock"
    });
    expect(payload.segments).toEqual([
      expect.objectContaining({
        label: "Dlugie Z2",
        paceSecondsPerKm: { min: 330, max: 389 },
        heartRateBpm: { min: 138, max: 151 }
      })
    ]);
  });
});
