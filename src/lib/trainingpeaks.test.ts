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
      notes: null
    });

    expect(payload).toMatchObject({
      workoutId: "workout-1",
      scheduledDate: "2026-05-17",
      provider: "TrainingPeaks",
      mode: "mock"
    });
  });
});
