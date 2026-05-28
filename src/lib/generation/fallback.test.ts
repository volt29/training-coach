import { describe, expect, it } from "vitest";

import { createFallbackWorkouts } from "@/lib/generation/fallback";
import { validateGeneratedWorkouts } from "@/lib/validators";

describe("createFallbackWorkouts", () => {
  it("creates exactly the requested number of running workouts", () => {
    const input = {
      weekStart: "2026-05-11",
      workoutsCount: 4,
      goals: {
        easy: 45,
        tempo: 20,
        intervals: 15,
        longRun: 15,
        recovery: 5
      }
    };

    const workouts = createFallbackWorkouts(input);

    expect(workouts).toHaveLength(4);
    expect(workouts.every((workout) => workout.sport === "run")).toBe(true);
    expect(validateGeneratedWorkouts(workouts, input)).toHaveLength(4);
  });

  it("scales fallback duration from athlete volume and keeps hard days separated", () => {
    const input = {
      weekStart: "2026-05-11",
      workoutsCount: 5,
      goals: {
        easy: 45,
        tempo: 15,
        intervals: 10,
        longRun: 20,
        recovery: 10
      }
    };

    const workouts = createFallbackWorkouts(input, {
      profile: {
        level: "ADVANCED",
        weeklyVolumeKm: 70,
        targetRace: "Maraton"
      },
      zones: [
        { type: "PACE", name: "Z1", minValue: 390, maxValue: 450, unit: "min/km" },
        { type: "PACE", name: "Z2", minValue: 330, maxValue: 389, unit: "min/km" },
        { type: "PACE", name: "Z3", minValue: 290, maxValue: 329, unit: "min/km" },
        { type: "PACE", name: "Z4", minValue: 255, maxValue: 289, unit: "min/km" }
      ],
      raceResults: [{ distanceKm: 10, resultSeconds: 2550 }]
    });

    expect(workouts.reduce((sum, workout) => sum + workout.durationMin, 0)).toBeGreaterThan(300);
    expect(workouts.some((workout) => workout.structure.includes("min/km"))).toBe(true);
    expect(validateGeneratedWorkouts(workouts, input)).toHaveLength(5);
  });
});
