import { addDays, parseISODate, toISODate } from "@/lib/dates";
import type {
  GeneratePlanInput,
  GeneratedWorkout,
  GeneratedWorkoutSegment
} from "@/lib/validators";

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
    sortOrder?: number;
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

type ZoneType = "PACE" | "HEART_RATE";

type SegmentTarget = {
  zoneName: string;
  paceMinSecPerKm: number;
  paceMaxSecPerKm: number;
  heartRateMinBpm: number;
  heartRateMaxBpm: number;
  intensity: string;
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

function formatPace(totalSeconds: number) {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function zoneOrdinal(zoneName: string) {
  const match = zoneName.match(/\d+/);
  return match ? Number(match[0]) - 1 : 0;
}

function zonesByType(context: FallbackContext | undefined, type: ZoneType) {
  return (context?.zones ?? [])
    .filter((zone) => zone.type === type)
    .sort((left, right) => {
      const leftOrder = left.sortOrder ?? zoneOrdinal(left.name);
      const rightOrder = right.sortOrder ?? zoneOrdinal(right.name);
      return leftOrder - rightOrder;
    });
}

function fallbackZone(type: ZoneType, zoneName: string) {
  const index = clamp(zoneOrdinal(zoneName), 0, 4);
  const paceDefaults = [
    { minValue: 390, maxValue: 480 },
    { minValue: 330, maxValue: 389 },
    { minValue: 290, maxValue: 329 },
    { minValue: 255, maxValue: 289 },
    { minValue: 220, maxValue: 254 }
  ];
  const heartRateDefaults = [
    { minValue: 115, maxValue: 137 },
    { minValue: 138, maxValue: 151 },
    { minValue: 152, maxValue: 165 },
    { minValue: 166, maxValue: 178 },
    { minValue: 179, maxValue: 194 }
  ];

  return {
    name: zoneName,
    ...(type === "PACE" ? paceDefaults[index] : heartRateDefaults[index])
  };
}

function resolveZone(
  context: FallbackContext | undefined,
  type: ZoneType,
  zoneName: string
) {
  const zones = zonesByType(context, type);
  const exactZone = zones.find((zone) => zone.name.toLowerCase() === zoneName.toLowerCase());

  if (exactZone) {
    return exactZone;
  }

  const ordinalZone = zones[clamp(zoneOrdinal(zoneName), 0, zones.length - 1)];
  return ordinalZone ?? fallbackZone(type, zoneName);
}

function segmentTarget(
  context: FallbackContext | undefined,
  zoneName: string,
  intensity: string
): SegmentTarget {
  const paceZone = resolveZone(context, "PACE", zoneName);
  const heartRateZone = resolveZone(context, "HEART_RATE", zoneName);

  return {
    zoneName: paceZone.name,
    paceMinSecPerKm: Math.round(paceZone.minValue),
    paceMaxSecPerKm: Math.round(paceZone.maxValue),
    heartRateMinBpm: Math.round(heartRateZone.minValue),
    heartRateMaxBpm: Math.round(heartRateZone.maxValue),
    intensity
  };
}

function formatTarget(segment: GeneratedWorkoutSegment) {
  return `${segment.zoneName} (${formatPace(segment.paceMinSecPerKm)}-${formatPace(
    segment.paceMaxSecPerKm
  )} min/km, HR ${segment.heartRateMinBpm}-${segment.heartRateMaxBpm} bpm)`;
}

function zonePaceHint(context: FallbackContext | undefined, zoneName: string) {
  const target = segmentTarget(context, zoneName, "niska");
  return `${target.zoneName} (${formatPace(target.paceMinSecPerKm)}-${formatPace(
    target.paceMaxSecPerKm
  )} min/km)`;
}

function easyPaceMinutes(context: FallbackContext | undefined) {
  const z2 = resolveZone(context, "PACE", "Z2");

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

function createSegment(
  context: FallbackContext | undefined,
  label: string,
  durationMin: number,
  zoneName: string,
  intensity: string,
  notes?: string
): GeneratedWorkoutSegment {
  return {
    label,
    durationMin,
    ...segmentTarget(context, zoneName, intensity),
    notes: notes ?? null
  };
}

function segmentsForGoal(
  goal: GoalKey,
  durationMin: number,
  context: FallbackContext | undefined
): GeneratedWorkoutSegment[] {
  if (goal === "recovery") {
    return [
      createSegment(
        context,
        "Regeneracja",
        durationMin,
        "Z1",
        GOAL_INTENSITY.recovery,
        "Bardzo swobodnie, bez kontroli tempa i bez akcentow."
      )
    ];
  }

  if (goal === "easy") {
    const warmup = 10;
    const cooldown = 5;
    return [
      createSegment(context, "Wejscie", warmup, "Z1", "bardzo niska"),
      createSegment(
        context,
        "Bieg swobodny",
        Math.max(1, durationMin - warmup - cooldown),
        "Z2",
        GOAL_INTENSITY.easy
      ),
      createSegment(context, "Schlodzenie", cooldown, "Z1", "bardzo niska")
    ];
  }

  if (goal === "intervals") {
    const warmup = 15;
    const reps = clamp(Math.floor((durationMin - 25) / 4), 4, 8);
    const cooldown = Math.max(5, durationMin - warmup - reps * 4);
    const segments: GeneratedWorkoutSegment[] = [
      createSegment(context, "Rozgrzewka", warmup, "Z1", "niska")
    ];

    for (let index = 1; index <= reps; index += 1) {
      segments.push(
        createSegment(context, `Powtorzenie ${index}`, 2, "Z4", GOAL_INTENSITY.intervals),
        createSegment(context, `Przerwa ${index}`, 2, "Z1", "bardzo niska", "Trucht.")
      );
    }

    segments.push(createSegment(context, "Schlodzenie", cooldown, "Z1", "niska"));
    return segments;
  }

  if (goal === "tempo") {
    const warmup = 15;
    const reps = durationMin >= 65 ? 3 : 2;
    const recoveryCount = reps - 1;
    const cooldown = Math.max(5, durationMin - warmup - reps * 8 - recoveryCount * 3);
    const segments: GeneratedWorkoutSegment[] = [
      createSegment(context, "Rozgrzewka", warmup, "Z1", "niska")
    ];

    for (let index = 1; index <= reps; index += 1) {
      segments.push(createSegment(context, `Tempo ${index}`, 8, "Z3", GOAL_INTENSITY.tempo));
      if (index < reps) {
        segments.push(createSegment(context, `Trucht ${index}`, 3, "Z1", "bardzo niska"));
      }
    }

    segments.push(createSegment(context, "Schlodzenie", cooldown, "Z1", "niska"));
    return segments;
  }

  const warmup = 10;
  const finish = 10;
  const cooldown = 5;
  return [
    createSegment(context, "Wejscie", warmup, "Z1", "niska"),
    createSegment(
      context,
      "Dlugie Z2",
      Math.max(1, durationMin - warmup - finish - cooldown),
      "Z2",
      GOAL_INTENSITY.longRun
    ),
    createSegment(context, "Narastajaco", finish, "Z2", "umiarkowana"),
    createSegment(context, "Schlodzenie", cooldown, "Z1", "niska")
  ];
}

function structureFromSegments(segments: GeneratedWorkoutSegment[]) {
  return segments
    .map((segment) => `${segment.label}: ${segment.durationMin} min ${formatTarget(segment)}`)
    .join(" + ");
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
    const segments = segmentsForGoal(slot.goal, durationMin, context);
    occurrences[slot.goal] = occurrence + 1;

    return {
      date: toISODate(addDays(weekStart, slot.day)),
      sport: "run",
      goal: slot.goal,
      title: titleForGoal(slot.goal, occurrence),
      durationMin,
      zoneName: GOAL_ZONE[slot.goal],
      intensity: GOAL_INTENSITY[slot.goal],
      structure: structureFromSegments(segments),
      segments,
      notes:
        "Plan regułowy dopasowany do profilu, stref, wyników i rekomendowanego rozkładu bodźców."
    };
  });
}
