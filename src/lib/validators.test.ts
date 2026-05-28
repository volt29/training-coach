import { describe, expect, it } from "vitest";

import {
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

  it("rejects hard workouts without a recovery day between them", () => {
    expect(() =>
      validateGeneratedWorkouts(
        [
          {
            date: "2026-05-11",
            sport: "run",
            goal: "intervals",
            title: "Interwały",
            durationMin: 50,
            zoneName: "Z4",
            intensity: "wysoka",
            structure: "6 x 2 min"
          },
          {
            date: "2026-05-12",
            sport: "run",
            goal: "tempo",
            title: "Tempo",
            durationMin: 55,
            zoneName: "Z3",
            intensity: "wysoka",
            structure: "3 x 8 min"
          },
          {
            date: "2026-05-17",
            sport: "run",
            goal: "longRun",
            title: "Długi bieg",
            durationMin: 90,
            zoneName: "Z2",
            intensity: "umiarkowana",
            structure: "90 min"
          }
        ],
        validInput
      )
    ).toThrow(/minimum jeden dzień/);
  });
});
