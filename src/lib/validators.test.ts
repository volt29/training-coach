import { describe, expect, it } from "vitest";

import {
  generatedWorkoutSegmentSchema,
  generatePlanInputSchema,
  validateGeneratedWorkouts,
  zonesInputSchema
} from "@/lib/validators";

const validInput = {
  weekStart: "2026-05-11",
  workoutsCount: 3,
  goals: {
    easy: 50,
    tempo: 20,
    intervals: 10,
    longRun: 15,
    recovery: 5
  }
};

function segment(overrides = {}) {
  return {
    label: "Segment",
    durationMin: 45,
    zoneName: "Z2",
    paceMinSecPerKm: 330,
    paceMaxSecPerKm: 389,
    heartRateMinBpm: 138,
    heartRateMaxBpm: 151,
    intensity: "niska",
    notes: null,
    ...overrides
  };
}

describe("validators", () => {
  it("accepts goal percentages summing to 100", () => {
    expect(generatePlanInputSchema.parse(validInput)).toEqual(validInput);
  });

  it("rejects goal percentages that do not sum to 100", () => {
    expect(() =>
      generatePlanInputSchema.parse({
        ...validInput,
        goals: { ...validInput.goals, recovery: 0 }
      })
    ).toThrow();
  });

  it("requires pace and heart-rate zones", () => {
    expect(() =>
      zonesInputSchema.parse({
        zones: [
          {
            type: "PACE",
            name: "Z1",
            minValue: 360,
            maxValue: 430,
            unit: "min/km",
            sortOrder: 1
          }
        ]
      })
    ).toThrow();
  });

  it("requires pace zones in minutes per kilometer", () => {
    expect(() =>
      zonesInputSchema.parse({
        zones: [
          {
            type: "PACE",
            name: "Z1",
            minValue: 300,
            maxValue: 320,
            unit: "m/s",
            sortOrder: 1
          },
          {
            type: "HEART_RATE",
            name: "Z1",
            minValue: 120,
            maxValue: 140,
            unit: "bpm",
            sortOrder: 1
          }
        ]
      })
    ).toThrow(/min\/km/);
  });

  it("rejects invalid segment pace and heart-rate ranges", () => {
    expect(() =>
      generatedWorkoutSegmentSchema.parse(
        segment({
          paceMinSecPerKm: 390,
          paceMaxSecPerKm: 330
        })
      )
    ).toThrow();

    expect(() =>
      generatedWorkoutSegmentSchema.parse(
        segment({
          heartRateMinBpm: 151,
          heartRateMaxBpm: 138
        })
      )
    ).toThrow();
  });

  it("rejects hard workouts without a recovery day between them", () => {
    expect(() =>
      validateGeneratedWorkouts(
        [
          {
            date: "2026-05-11",
            sport: "run",
            goal: "intervals",
            title: "Interwaly",
            durationMin: 50,
            zoneName: "Z4",
            intensity: "wysoka",
            structure: "6 x 2 min",
            segments: [segment({ durationMin: 50, zoneName: "Z4" })]
          },
          {
            date: "2026-05-12",
            sport: "run",
            goal: "tempo",
            title: "Tempo",
            durationMin: 55,
            zoneName: "Z3",
            intensity: "wysoka",
            structure: "3 x 8 min",
            segments: [segment({ durationMin: 55, zoneName: "Z3" })]
          },
          {
            date: "2026-05-17",
            sport: "run",
            goal: "longRun",
            title: "Dlugi bieg",
            durationMin: 90,
            zoneName: "Z2",
            intensity: "umiarkowana",
            structure: "90 min",
            segments: [segment({ durationMin: 90 })]
          }
        ],
        validInput
      )
    ).toThrow(/minimum jeden/);
  });

  it("rejects generated workouts when segment durations do not match the workout", () => {
    expect(() =>
      validateGeneratedWorkouts(
        [
          {
            date: "2026-05-11",
            sport: "run",
            goal: "easy",
            title: "Easy",
            durationMin: 45,
            zoneName: "Z2",
            intensity: "niska",
            structure: "45 min",
            segments: [segment({ durationMin: 20 })]
          },
          {
            date: "2026-05-13",
            sport: "run",
            goal: "easy",
            title: "Easy 2",
            durationMin: 45,
            zoneName: "Z2",
            intensity: "niska",
            structure: "45 min",
            segments: [segment()]
          },
          {
            date: "2026-05-17",
            sport: "run",
            goal: "longRun",
            title: "Long",
            durationMin: 60,
            zoneName: "Z2",
            intensity: "umiarkowana",
            structure: "60 min",
            segments: [segment({ durationMin: 60 })]
          }
        ],
        validInput
      )
    ).toThrow(/Suma segmentow/);
  });
});
