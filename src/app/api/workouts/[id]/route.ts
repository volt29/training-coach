import { apiError, requireApiUser } from "@/lib/api";
import { getDayIndex, isDateInWeek, parseISODate, toISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { workoutPatchSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const input = workoutPatchSchema.parse(await request.json());
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

    const updatedWorkout = await prisma.workout.update({
      where: { id: workout.id },
      data: {
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
      }
    });

    return Response.json({ workout: updatedWorkout });
  } catch (error) {
    return apiError(error);
  }
}
