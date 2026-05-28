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
  it("parses fenced JSON and validates the workout list", () => {
    const result = parseAiPlanResponse(
      `\`\`\`json
      {"workouts":[
        {"date":"2026-05-13","sport":"run","goal":"recovery","title":"Regeneracja","durationMin":35,"zoneName":"Z1","intensity":"niska","structure":"35 min lekko"},
        {"date":"2026-05-17","sport":"run","goal":"longRun","title":"Długi bieg","durationMin":85,"zoneName":"Z2","intensity":"umiarkowana","structure":"85 min spokojnie"}
      ]}
      \`\`\``,
      input
    );

    expect(result).toHaveLength(2);
  });

  it("rejects malformed JSON content", () => {
    expect(() => parseAiPlanResponse("bez json", input)).toThrow(/JSON/);
  });
});
