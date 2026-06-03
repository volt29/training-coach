import { z } from "zod";

import { getDayIndex, isDateInWeek } from "@/lib/dates";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const goalAllocationSchema = z
  .object({
    easy: z.coerce.number().int().min(0).max(100),
    tempo: z.coerce.number().int().min(0).max(100),
    intervals: z.coerce.number().int().min(0).max(100),
    longRun: z.coerce.number().int().min(0).max(100),
    recovery: z.coerce.number().int().min(0).max(100)
  })
  .refine(
    (value) =>
      value.easy +
        value.tempo +
        value.intervals +
        value.longRun +
        value.recovery ===
      100,
    "Procenty celów muszą sumować się do 100%."
  );

export const profileInputSchema = z.object({
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  weeklyVolumeKm: z.coerce.number().int().min(0).max(300).optional().nullable(),
  targetRace: z.string().max(80).optional().nullable(),
  notes: z.string().max(800).optional().nullable()
});

export const zoneInputSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(["PACE", "HEART_RATE"]),
    name: z.string().min(1).max(40),
    minValue: z.coerce.number().positive().max(9999),
    maxValue: z.coerce.number().positive().max(9999),
    unit: z.string().min(1).max(16),
    sortOrder: z.coerce.number().int().min(0).max(99).default(0)
  })
  .refine((zone) => zone.minValue < zone.maxValue, {
    message: "Dolna granica strefy musi być mniejsza niż górna."
  })
  .refine(
    (zone) =>
      zone.type !== "HEART_RATE" ||
      (Number.isInteger(zone.minValue) && Number.isInteger(zone.maxValue)),
    {
      message: "Strefy tętna muszą używać pełnych wartości bpm."
    }
  )
  .refine((zone) => zone.type !== "PACE" || zone.unit === "min/km", {
    message: "Strefy tempa muszą być podane w min/km."
  });

export const zonesInputSchema = z
  .object({
    zones: z.array(zoneInputSchema).min(2).max(20)
  })
  .superRefine((value, ctx) => {
    const hasPace = value.zones.some((zone) => zone.type === "PACE");
    const hasHeartRate = value.zones.some((zone) => zone.type === "HEART_RATE");

    if (!hasPace) {
      ctx.addIssue({
        code: "custom",
        message: "Wymagana jest co najmniej jedna strefa tempa."
      });
    }

    if (!hasHeartRate) {
      ctx.addIssue({
        code: "custom",
        message: "Wymagana jest co najmniej jedna strefa tętna."
      });
    }
  });

export const raceResultInputSchema = z.object({
  distanceKm: z.coerce.number().positive().max(100),
  resultSeconds: z.coerce.number().int().positive().max(24 * 60 * 60),
  raceDate: isoDateSchema,
  notes: z.string().max(300).optional().nullable()
});

export const generatePlanInputSchema = z.object({
  weekStart: isoDateSchema,
  workoutsCount: z.coerce.number().int().min(1).max(7),
  goals: goalAllocationSchema
});

export const workoutPatchSchema = z.object({
  date: isoDateSchema.optional(),
  goal: z.string().min(1).max(60).optional(),
  title: z.string().min(1).max(100).optional(),
  durationMin: z.coerce.number().int().min(10).max(300).optional(),
  zoneName: z.string().min(1).max(40).optional(),
  intensity: z.string().min(1).max(40).optional(),
  structure: z.string().min(1).max(600).optional(),
  notes: z.string().max(800).optional().nullable(),
  status: z
    .enum(["PLANNED", "ACCEPTED", "DONE", "SKIPPED", "EXPORTED"])
    .optional()
});

export const workoutStatusSchema = z.object({
  status: z.enum(["PLANNED", "ACCEPTED", "DONE", "SKIPPED", "EXPORTED"])
});

export const generatedWorkoutSegmentSchema = z
  .object({
    label: z.string().min(1).max(80),
    durationMin: z.coerce.number().int().min(1).max(300),
    zoneName: z.string().min(1).max(40),
    paceMinSecPerKm: z.coerce.number().int().positive().max(9999),
    paceMaxSecPerKm: z.coerce.number().int().positive().max(9999),
    heartRateMinBpm: z.coerce.number().int().positive().max(999),
    heartRateMaxBpm: z.coerce.number().int().positive().max(999),
    intensity: z.string().min(1).max(40),
    notes: z.string().max(300).optional().nullable()
  })
  .refine((segment) => segment.paceMinSecPerKm < segment.paceMaxSecPerKm, {
    message: "Dolny zakres tempa segmentu musi byc mniejszy niz gorny."
  })
  .refine((segment) => segment.heartRateMinBpm < segment.heartRateMaxBpm, {
    message: "Dolny zakres tetna segmentu musi byc mniejszy niz gorny."
  });

export const workoutSegmentPatchSchema = generatedWorkoutSegmentSchema.extend({
  id: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).max(99).optional()
});

export const generatedWorkoutSchema = z.object({
  date: isoDateSchema,
  sport: z.literal("run"),
  goal: z.string().min(1).max(60),
  title: z.string().min(1).max(100),
  durationMin: z.coerce.number().int().min(10).max(300),
  zoneName: z.string().min(1).max(40),
  intensity: z.string().min(1).max(40),
  structure: z.string().min(1).max(600),
  notes: z.string().max(800).optional().nullable(),
  segments: z.array(generatedWorkoutSegmentSchema).min(1).max(80)
});

export const workoutPatchWithSegmentsSchema = workoutPatchSchema.extend({
  segments: z.array(workoutSegmentPatchSchema).max(80).optional()
});

export const generatedPlanSchema = z.object({
  workouts: z.array(generatedWorkoutSchema)
});

export type GoalAllocation = z.infer<typeof goalAllocationSchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanInputSchema>;
export type GeneratedWorkoutSegment = z.infer<typeof generatedWorkoutSegmentSchema>;
export type GeneratedWorkout = z.infer<typeof generatedWorkoutSchema>;

const HARD_GOALS = new Set(["tempo", "intervals", "longRun"]);
const SEGMENT_DURATION_TOLERANCE_MINUTES = 5;

function isHardWorkout(workout: GeneratedWorkout) {
  const normalized = workout.goal.trim();
  const intensity = workout.intensity.toLowerCase();
  return (
    HARD_GOALS.has(normalized) ||
    intensity.includes("wysoka") ||
    intensity.includes("hard") ||
    intensity.includes("threshold") ||
    intensity.includes("interwa")
  );
}

export function validateGeneratedWorkouts(
  workouts: GeneratedWorkout[],
  input: GeneratePlanInput
) {
  if (workouts.length !== input.workoutsCount) {
    throw new Error(
      `Generator zwrócił ${workouts.length} treningów zamiast ${input.workoutsCount}.`
    );
  }

  const dayIndexes = workouts
    .map((workout) => {
      if (!isDateInWeek(input.weekStart, workout.date)) {
        throw new Error(`Trening ${workout.title} jest poza wybranym tygodniem.`);
      }

      if (workout.sport !== "run") {
        throw new Error("MVP obsługuje wyłącznie bieganie.");
      }

      return getDayIndex(input.weekStart, workout.date);
    })
    .sort((a, b) => a - b);

  const uniqueDays = new Set(dayIndexes);

  if (uniqueDays.size !== dayIndexes.length) {
    throw new Error("MVP planuje maksymalnie jeden trening dziennie.");
  }

  const hardDays = workouts
    .filter(isHardWorkout)
    .map((workout) => getDayIndex(input.weekStart, workout.date))
    .sort((a, b) => a - b);

  for (let index = 1; index < hardDays.length; index += 1) {
    if (hardDays[index] - hardDays[index - 1] < 2) {
      throw new Error(
        "Między ciężkimi jednostkami musi być minimum jeden dzień bez mocnego bodźca."
      );
    }
  }

  for (const workout of workouts) {
    const segmentMinutes = workout.segments.reduce(
      (sum, segment) => sum + segment.durationMin,
      0
    );

    if (Math.abs(segmentMinutes - workout.durationMin) > SEGMENT_DURATION_TOLERANCE_MINUTES) {
      throw new Error(
        `Suma segmentow treningu ${workout.title} rozni sie od czasu treningu o wiecej niz ${SEGMENT_DURATION_TOLERANCE_MINUTES} min.`
      );
    }

    workout.segments.forEach((segment, index) => {
      if (segment.paceMinSecPerKm >= segment.paceMaxSecPerKm) {
        throw new Error(`Segment ${index + 1} treningu ${workout.title} ma bledny zakres tempa.`);
      }

      if (segment.heartRateMinBpm >= segment.heartRateMaxBpm) {
        throw new Error(`Segment ${index + 1} treningu ${workout.title} ma bledny zakres tetna.`);
      }
    });
  }

  return workouts;
}
