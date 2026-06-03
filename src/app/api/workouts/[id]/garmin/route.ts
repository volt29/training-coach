import { apiError, requireApiUser } from "@/lib/api";
import { exportWorkoutToGarminCalendar } from "@/lib/garmin";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { id } = await params;
  const workout = await prisma.workout.findFirst({
    where: {
      id,
      userId: auth.userId
    },
    include: {
      segments: {
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  if (!workout) {
    return Response.json({ error: "Nie znaleziono treningu." }, { status: 404 });
  }

  try {
    const exportResult = await exportWorkoutToGarminCalendar(auth.userId, workout);

    return Response.json(exportResult);
  } catch (error) {
    return apiError(error);
  }
}
