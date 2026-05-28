import { describe, expect, it } from "vitest";

import { buildCoachInsights } from "@/lib/coach/insights";

describe("buildCoachInsights", () => {
  it("detects race progress and recommends cautious progression", () => {
    const insights = buildCoachInsights({
      weekStart: "2026-05-11",
      profile: {
        level: "INTERMEDIATE",
        weeklyVolumeKm: 45,
        targetRace: "10 km"
      },
      plans: [
        {
          weekStart: "2026-05-11",
          workouts: [
            {
              date: "2026-05-11",
              durationMin: 45,
              goal: "easy",
              intensity: "niska",
              status: "DONE",
              title: "Bieg spokojny"
            },
            {
              date: "2026-05-13",
              durationMin: 55,
              goal: "intervals",
              intensity: "wysoka",
              status: "DONE",
              title: "Interwaly"
            },
            {
              date: "2026-05-17",
              durationMin: 85,
              goal: "longRun",
              intensity: "umiarkowana",
              status: "DONE",
              title: "Dlugi bieg"
            }
          ]
        }
      ],
      raceResults: [
        {
          distanceKm: 10,
          raceDate: "2026-05-10",
          resultSeconds: 2600
        },
        {
          distanceKm: 10,
          raceDate: "2026-04-20",
          resultSeconds: 2700
        }
      ]
    });

    expect(insights.currentWeek.completionRate).toBe(100);
    expect(insights.raceTrend.state).toBe("progress");
    expect(insights.recommendation.status).toBe("progress");
    expect(insights.recommendation.nextWorkoutsCount).toBe(5);
  });

  it("recommends deload after repeated skipped workouts", () => {
    const insights = buildCoachInsights({
      weekStart: "2026-05-11",
      profile: {
        level: "ADVANCED",
        weeklyVolumeKm: 70,
        targetRace: "Maraton"
      },
      plans: [
        {
          weekStart: "2026-05-11",
          workouts: [
            {
              date: "2026-05-11",
              durationMin: 45,
              goal: "easy",
              intensity: "niska",
              status: "SKIPPED",
              title: "Bieg spokojny"
            },
            {
              date: "2026-05-13",
              durationMin: 60,
              goal: "tempo",
              intensity: "wysoka",
              status: "SKIPPED",
              title: "Tempo"
            },
            {
              date: "2026-05-17",
              durationMin: 90,
              goal: "longRun",
              intensity: "umiarkowana",
              status: "PLANNED",
              title: "Dlugi bieg"
            }
          ]
        }
      ],
      raceResults: []
    });

    expect(insights.currentWeek.skippedWorkouts).toBe(2);
    expect(insights.recommendation.status).toBe("deload");
    expect(insights.recommendation.suggestedGoals.recovery).toBe(15);
  });

  it("does not treat a freshly planned week as failed adherence", () => {
    const insights = buildCoachInsights({
      weekStart: "2026-05-11",
      profile: {
        level: "INTERMEDIATE",
        weeklyVolumeKm: 45,
        targetRace: "10 km"
      },
      plans: [
        {
          weekStart: "2026-05-11",
          workouts: [
            {
              date: "2026-05-11",
              durationMin: 55,
              goal: "easy",
              intensity: "niska",
              status: "PLANNED",
              title: "Bieg spokojny"
            },
            {
              date: "2026-05-13",
              durationMin: 60,
              goal: "tempo",
              intensity: "średnio-wysoka",
              status: "PLANNED",
              title: "Tempo"
            },
            {
              date: "2026-05-17",
              durationMin: 90,
              goal: "longRun",
              intensity: "umiarkowana",
              status: "PLANNED",
              title: "Długi bieg"
            }
          ]
        }
      ],
      raceResults: []
    });

    expect(insights.rollingFourWeeks.adherenceRate).toBeNull();
    expect(insights.recommendation.status).not.toBe("deload");
  });
});
