import type { Prisma } from "@prisma/client";

import { apiError, requireApiUser } from "@/lib/api";
import { getDayIndex, isDateInWeek, parseISODate, toISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { workoutPatchWithSegmentsSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const input = workoutPatchWithSegmentsSchema.parse(await request.json());
    const workout = await prisma.workout.findFirst({
      where: {
        id,
        userId: auth.userId
      },
      include: {
        plan: true
      }
    });

    if (!workout) {
      return Response.json({ error: "Nie znaleziono treningu." }, { status: 404 });
    }

    const weekStart = toISODate(workout.plan.weekStart);

    if (input.date && !isDateInWeek(weekStart, input.date)) {
      return Response.json(
        { error: "Trening musi pozostać w tygodniu planu." },
        { status: 400 }
      );
    }

    const data: Prisma.WorkoutUpdateInput = {
      goal: input.goal,
      title: input.title,
      durationMin: input.durationMin,
      zoneName: input.zoneName,
      intensity: input.intensity,
      structure: input.structure,
      notes: input.notes,
      status: input.status,
      date: input.date ? parseISODate(input.date) : undefined,
      dayIndex: input.date ? getDayIndex(weekStart, input.date) : undefined
    };

    if (input.segments) {
      data.segments = {
        deleteMany: {},
        create: input.segments
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
          .map((segment, index) => ({
            sortOrder: index,
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
      };
    }

    const updatedWorkout = await prisma.workout.update({
      where: { id: workout.id },
      data,
      include: {
        segments: {
          orderBy: { sortOrder: "asc" }
        }
      }
    });

    return Response.json({ workout: updatedWorkout });
  } catch (error) {
    return apiError(error);
  }
}
