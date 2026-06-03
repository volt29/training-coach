import type { PlanSource } from "@prisma/client";

import { getDayIndex, parseISODate } from "@/lib/dates";
import { generateTrainingWorkouts } from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import { zonesInputSchema } from "@/lib/validators";
import type { GeneratePlanInput } from "@/lib/validators";

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function generatePlanForUser(
  userId: string,
  input: GeneratePlanInput
) {
  const [profile, zones, raceResults] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    prisma.intensityZone.findMany({
      where: { userId },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }]
    }),
    prisma.raceResult.findMany({
      where: { userId },
      orderBy: { raceDate: "desc" },
      take: 8
    })
  ]);

  const zonesValidation = zonesInputSchema.safeParse({ zones });

  if (!zonesValidation.success) {
    throw new DomainError("Zapisz strefy tempa i tętna przed generowaniem planu.");
  }

  const generation = await generateTrainingWorkouts(input, {
    profile,
    zones,
    raceResults
  });
  const weekStartDate = parseISODate(input.weekStart);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.trainingPlan.findUnique({
      where: {
        userId_weekStart: {
          userId,
          weekStart: weekStartDate
        }
      }
    });

    if (existing) {
      await tx.trainingPlan.delete({ where: { id: existing.id } });
    }

    return tx.trainingPlan.create({
      data: {
        userId,
        weekStart: weekStartDate,
        source: generation.source as PlanSource,
        workouts: {
          create: generation.workouts.map((workout, index) => ({
            userId,
            date: parseISODate(workout.date),
            dayIndex: getDayIndex(input.weekStart, workout.date),
            sport: workout.sport,
            goal: workout.goal,
            title: workout.title,
            durationMin: workout.durationMin,
            zoneName: workout.zoneName,
            intensity: workout.intensity,
            structure: workout.structure,
            notes: workout.notes,
            sortOrder: index,
            segments: {
              create: workout.segments.map((segment, segmentIndex) => ({
                sortOrder: segmentIndex,
                label: segment.label,
                durationMin: segment.durationMin,
                zoneName: segment.zoneName,
                paceMinSecPerKm: segment.paceMinSecPerKm,
                paceMaxSecPerKm: segment.paceMaxSecPerKm,
                heartRateMinBpm: segment.heartRateMinBpm,
                heartRateMaxBpm: segment.heartRateMaxBpm,
                intensity: segment.intensity,
                notes: segment.notes
              }))
            }
          }))
        },
        requests: {
          create: {
            userId,
            weekStart: weekStartDate,
            workoutsCount: input.workoutsCount,
            goalsJson: JSON.stringify(input.goals),
            prompt: generation.prompt,
            response: generation.rawResponse,
            source: generation.source as PlanSource,
            validationErrors: generation.validationErrors
          }
        }
      },
      include: {
        workouts: {
          orderBy: [{ dayIndex: "asc" }, { sortOrder: "asc" }],
          include: {
            segments: {
              orderBy: { sortOrder: "asc" }
            }
          }
        },
        requests: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
  });
}

export async function getPlanForUser(userId: string, weekStart: string) {
  return prisma.trainingPlan.findUnique({
    where: {
      userId_weekStart: {
        userId,
        weekStart: parseISODate(weekStart)
      }
    },
    include: {
      workouts: {
        orderBy: [{ dayIndex: "asc" }, { sortOrder: "asc" }],
        include: {
          segments: {
            orderBy: { sortOrder: "asc" }
          }
        }
      },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
}
