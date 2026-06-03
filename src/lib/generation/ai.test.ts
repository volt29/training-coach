import { describe, expect, it } from "vitest";

import { parseAiPlanResponse } from "@/lib/generation/ai";

const input = {
  weekStart: "2026-05-11",
  workoutsCount: 2,
  goals: {
    easy: 70,
    tempo: 0,
    intervals: 0,
    longRun: 20,
    recovery: 10
  }
};

describe("parseAiPlanResponse", () => {
  it("parses fenced JSON with segment pace and heart-rate targets", () => {
    const result = parseAiPlanResponse(
      `\`\`\`json
      {"workouts":[
        {"date":"2026-05-13","sport":"run","goal":"recovery","title":"Regeneracja","durationMin":35,"zoneName":"Z1","intensity":"niska","structure":"35 min lekko","segments":[{"label":"Regeneracja","durationMin":35,"zoneName":"Z1","paceMinSecPerKm":390,"paceMaxSecPerKm":480,"heartRateMinBpm":115,"heartRateMaxBpm":137,"intensity":"niska","notes":null}]},
        {"date":"2026-05-17","sport":"run","goal":"longRun","title":"Dlugi bieg","durationMin":85,"zoneName":"Z2","intensity":"umiarkowana","structure":"85 min spokojnie","segments":[{"label":"Dlugie Z2","durationMin":85,"zoneName":"Z2","paceMinSecPerKm":330,"paceMaxSecPerKm":389,"heartRateMinBpm":138,"heartRateMaxBpm":151,"intensity":"umiarkowana","notes":null}]}
      ]}
      \`\`\``,
      input
    );

    expect(result).toHaveLength(2);
    expect(result[0].segments[0].heartRateMinBpm).toBe(115);
  });

  it("rejects malformed JSON content", () => {
    expect(() => parseAiPlanResponse("bez json", input)).toThrow(/JSON/);
  });

  it("rejects plans without segment targets", () => {
    expect(() =>
      parseAiPlanResponse(
        `{"workouts":[
          {"date":"2026-05-13","sport":"run","goal":"recovery","title":"Regeneracja","durationMin":35,"zoneName":"Z1","intensity":"niska","structure":"35 min lekko"},
          {"date":"2026-05-17","sport":"run","goal":"longRun","title":"Dlugi bieg","durationMin":85,"zoneName":"Z2","intensity":"umiarkowana","structure":"85 min spokojnie"}
        ]}`,
        input
      )
    ).toThrow();
  });
});
