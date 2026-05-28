import { addDays, parseISODate, toISODate } from "@/lib/dates";
import type { GeneratePlanInput, GeneratedWorkout } from "@/lib/validators";

type AthleteLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
type GoalKey = keyof GeneratePlanInput["goals"];

type FallbackContext = {
  profile?: {
    level?: string;
    weeklyVolumeKm?: number | null;
    targetRace?: string | null;
  } | null;
  zones?: Array<{
    type: string;
    name: string;
    minValue: number;
    maxValue: number;
    unit: string;
  }>;
  raceResults?: Array<{
    distanceKm: number;
    resultSeconds: number;
  }>;
};

type WorkoutSlot = {
  day: number;
  goal: GoalKey;
};

const GOAL_ZONE: Record<GoalKey, string> = {
  easy: "Z2",
  tempo: "Z3",
  intervals: "Z4",
  longRun: "Z2",
  recovery: "Z1"
};

const GOAL_INTENSITY: Record<GoalKey, string> = {
  easy: "niska",
  tempo: "średnio-wysoka",
  intervals: "wysoka",
  longRun: "umiarkowana",
  recovery: "bardzo niska"
};

const GOAL_WEIGHT: Record<GoalKey, number> = {
  easy: 1,
  tempo: 1.05,
  intervals: 0.95,
  longRun: 1.45,
  recovery: 0.7
};

const GOAL_DURATION_LIMITS: Record<GoalKey, { min: number; max: number }> = {
  easy: { min: 35, max: 90 },
  tempo: { min: 45, max: 85 },
  intervals: { min: 45, max: 80 },
  longRun: { min: 60, max: 145 },
  recovery: { min: 25, max: 55 }
};

const LEVEL_DEFAULT_MINUTES: Record<AthleteLevel, number> = {
  BEGINNER: 160,
  INTERMEDIATE: 250,
  ADVANCED: 380
};

const LEVEL_MINUTES_RANGE: Record<AthleteLevel, { min: number; max: number }> = {
  BEGINNER: { min: 90, max: 240 },
  INTERMEDIATE: { min: 150, max: 390 },
  ADVANCED: { min: 240, max: 560 }
};

const EASY_TITLES = ["Bieg spokojny", "Bieg tlenowy", "Spokojne kilometry"];
const RECOVERY_TITLES = ["Regeneracja", "Rozbieganie regeneracyjne"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

function normalizeLevel(value: string | undefined): AthleteLevel {
  return value === "BEGINNER" || value === "ADVANCED" ? value : "INTERMEDIATE";
}

function findPaceZone(context: FallbackContext | undefined, zoneName: string) {
  return context?.zones?.find((zone) => zone.type === "PACE" && zone.name === zoneName);
}

function formatPace(totalSeconds: number) {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function zonePaceHint(context: FallbackContext | undefined, zoneName: string) {
  const zone = findPaceZone(context, zoneName);

  if (!zone) {
    return zoneName;
  }

  return `${zoneName} (${formatPace(zone.minValue)}-${formatPace(zone.maxValue)} min/km)`;
}

function easyPaceMinutes(context: FallbackContext | undefined) {
  const z2 = findPaceZone(context, "Z2");

  if (z2) {
    return (z2.minValue + z2.maxValue) / 2 / 60;
  }

  const latestRace = context?.raceResults?.[0];

  if (latestRace && latestRace.distanceKm > 0) {
    return (latestRace.resultSeconds / latestRace.distanceKm / 60) * 1.25;
  }

  return 6;
}

function targetWeeklyMinutes(input: GeneratePlanInput, context: FallbackContext | undefined) {
  const level = normalizeLevel(context?.profile?.level);
  const range = LEVEL_MINUTES_RANGE[level];
  const profileMinutes =
    typeof context?.profile?.weeklyVolumeKm === "number" && context.profile.weeklyVolumeKm > 0
      ? context.profile.weeklyVolumeKm * easyPaceMinutes(context)
      : LEVEL_DEFAULT_MINUTES[level];
  const countRange = {
    min: input.workoutsCount * 30,
    max: input.workoutsCount * 95
  };

  return roundToNearestFive(
    clamp(
      profileMinutes,
      Math.max(range.min, countRange.min),
      Math.min(range.max, countRange.max)
    )
  );
}

function isHardGoal(goal: GoalKey) {
  return goal === "tempo" || goal === "intervals" || goal === "longRun";
}

function hasHardNeighbour(day: number, slots: WorkoutSlot[]) {
  return slots.some((slot) => isHardGoal(slot.goal) && Math.abs(slot.day - day) < 2);
}

function addSlot(
  slots: WorkoutSlot[],
  goal: GoalKey,
  preferredDays: number[],
  options: { enforceHardSpacing?: boolean } = {}
) {
  for (const day of preferredDays) {
    const isFree = !slots.some((slot) => slot.day === day);
    const spacingOk =
      !options.enforceHardSpacing || !isHardGoal(goal) || !hasHardNeighbour(day, slots);

    if (isFree && spacingOk) {
      slots.push({ day, goal });
      return true;
    }
  }

  return false;
}

function rankedGoals(input: GeneratePlanInput, goals: GoalKey[]) {
  return [...goals].sort((left, right) => input.goals[right] - input.goals[left]);
}

function buildWorkoutSlots(input: GeneratePlanInput): WorkoutSlot[] {
  const slots: WorkoutSlot[] = [];
  const maxHardWorkouts = input.workoutsCount >= 5 ? 3 : input.workoutsCount >= 3 ? 2 : 1;
  const hardGoals = rankedGoals(input, ["intervals", "tempo"]).filter(
    (goal) => input.goals[goal] > 0
  );

  if (input.workoutsCount === 1) {
    const singleGoal = input.goals.longRun >= 20 ? "longRun" : "easy";
    return [{ day: singleGoal === "longRun" ? 6 : 2, goal: singleGoal }];
  }

  if (input.goals.longRun > 0) {
    addSlot(slots, "longRun", [6], { enforceHardSpacing: true });
  }

  for (const hardGoal of hardGoals) {
    if (slots.filter((slot) => isHardGoal(slot.goal)).length >= maxHardWorkouts) {
      break;
    }

    addSlot(slots, hardGoal, [1, 3], { enforceHardSpacing: true });
  }

  if (input.goals.recovery >= 10 || input.workoutsCount >= 5) {
    addSlot(slots, "recovery", [2, 4, 5, 0]);
  }

  while (slots.length < input.workoutsCount) {
    const fillerGoal =
      input.goals.recovery > input.goals.easy && slots.length < input.workoutsCount - 1
        ? "recovery"
        : "easy";
    const added = addSlot(slots, fillerGoal, [0, 2, 3, 4, 5, 1, 6]);

    if (!added) {
      break;
    }
  }

  return slots.sort((left, right) => left.day - right.day).slice(0, input.workoutsCount);
}

function durationForSlot(slot: WorkoutSlot, targetMinutes: number, totalWeight: number) {
  const limits = GOAL_DURATION_LIMITS[slot.goal];
  const raw = (targetMinutes * GOAL_WEIGHT[slot.goal]) / totalWeight;

  return roundToNearestFive(clamp(raw, limits.min, limits.max));
}

function titleForGoal(goal: GoalKey, occurrence: number) {
  if (goal === "easy") {
    return EASY_TITLES[occurrence % EASY_TITLES.length];
  }

  if (goal === "recovery") {
    return RECOVERY_TITLES[occurrence % RECOVERY_TITLES.length];
  }

  if (goal === "intervals") {
    return "Interwały krótkie";
  }

  if (goal === "tempo") {
    return "Tempo progowe";
  }

  return "Długi bieg";
}

function structureForGoal(goal: GoalKey, durationMin: number, context: FallbackContext | undefined) {
  const zoneName = GOAL_ZONE[goal];
  const paceHint = zonePaceHint(context, zoneName);

  if (goal === "recovery") {
    return `${durationMin} min bardzo lekko w ${paceHint}, bez kontroli tempa i bez akcentów.`;
  }

  if (goal === "easy") {
    return `10 min wejścia + ${Math.max(20, durationMin - 15)} min swobodnego biegu w ${paceHint} + 5 min schłodzenia.`;
  }

  if (goal === "intervals") {
    const reps = clamp(Math.floor((durationMin - 25) / 4), 4, 8);
    return `15 min rozgrzewki + ${reps} x 2 min w ${paceHint} / 2 min trucht + 10 min schłodzenia.`;
  }

  if (goal === "tempo") {
    const reps = durationMin >= 65 ? 3 : 2;
    return `15 min rozgrzewki + ${reps} x 8 min w ${paceHint} / 3 min trucht + 10 min schłodzenia.`;
  }

  return `${Math.max(45, durationMin - 15)} min spokojnie w ${paceHint} + 10 min lekko narastająco + 5 min schłodzenia.`;
}

export function createFallbackWorkouts(
  input: GeneratePlanInput,
  context?: FallbackContext
): GeneratedWorkout[] {
  const weekStart = parseISODate(input.weekStart);
  const slots = buildWorkoutSlots(input);
  const targetMinutes = targetWeeklyMinutes(input, context);
  const totalWeight = slots.reduce((sum, slot) => sum + GOAL_WEIGHT[slot.goal], 0);
  const occurrences: Partial<Record<GoalKey, number>> = {};

  return slots.map((slot) => {
    const occurrence = occurrences[slot.goal] ?? 0;
    const durationMin = durationForSlot(slot, targetMinutes, totalWeight);
    occurrences[slot.goal] = occurrence + 1;

    return {
      date: toISODate(addDays(weekStart, slot.day)),
      sport: "run",
      goal: slot.goal,
      title: titleForGoal(slot.goal, occurrence),
      durationMin,
      zoneName: GOAL_ZONE[slot.goal],
      intensity: GOAL_INTENSITY[slot.goal],
      structure: structureForGoal(slot.goal, durationMin, context),
      notes:
        "Plan regułowy dopasowany do profilu, stref, wyników i rekomendowanego rozkładu bodźców."
    };
  });
}
