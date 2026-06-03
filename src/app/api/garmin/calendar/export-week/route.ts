import { apiError, requireApiUser } from "@/lib/api";
import { parseISODate } from "@/lib/dates";
import { canExportWorkoutToGarminCalendar, exportWorkoutToGarminCalendar } from "@/lib/garmin";
import { prisma } from "@/lib/prisma";
import { isoDateSchema } from "@/lib/validators";

type WeekExportResult =
  | {
      workoutId: string;
      status: "SUCCESS";
      externalId: string;
      reused: boolean;
    }
  | {
      workoutId: string;
      status: "FAILED";
      error: string;
    }
  | {
      workoutId: string;
      status: "SKIPPED";
      reason: string;
    };

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const input = isoDateSchema.parse((await request.json()).weekStart);
    const weekStart = parseISODate(input);
    const plan = await prisma.trainingPlan.findUnique({
      where: {
        userId_weekStart: {
          userId: auth.userId,
          weekStart
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

    if (!plan) {
      return Response.json(
        { error: "Nie znaleziono planu dla wybranego tygodnia." },
        { status: 404 }
      );
    }

    const results: WeekExportResult[] = [];
    for (const workout of plan.workouts) {
      if (!canExportWorkoutToGarminCalendar(workout)) {
        results.push({
          workoutId: workout.id,
          status: "SKIPPED",
          reason: "Trening wykonany albo pominiety nie jest wysylany do kalendarza Garmin."
        });
        continue;
      }

      try {
        const result = await exportWorkoutToGarminCalendar(auth.userId, workout);
        results.push({
          workoutId: workout.id,
          status: "SUCCESS",
          externalId: result.export.externalId,
          reused: Boolean(result.export.reused)
        });
      } catch (error) {
        results.push({
          workoutId: workout.id,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown Garmin error"
        });
      }
    }

    const refreshedPlan = await prisma.trainingPlan.findUnique({
      where: {
        userId_weekStart: {
          userId: auth.userId,
          weekStart
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

    return Response.json({
      plan: refreshedPlan,
      exportedCount: results.filter(
        (result) => result.status === "SUCCESS" && !result.reused
      ).length,
      reusedCount: results.filter(
        (result) => result.status === "SUCCESS" && result.reused
      ).length,
      failedCount: results.filter((result) => result.status === "FAILED").length,
      skippedCount: results.filter((result) => result.status === "SKIPPED").length,
      results
    });
  } catch (error) {
    return apiError(error);
  }
}
