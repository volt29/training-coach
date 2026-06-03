import { apiError, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const workout = await prisma.workout.findFirst({
      where: {
        id,
        userId: auth.userId
      }
    });

    if (!workout) {
      return Response.json({ error: "Nie znaleziono treningu." }, { status: 404 });
    }

    const updatedWorkout = await prisma.workout.update({
      where: { id: workout.id },
      data: { status: "ACCEPTED" },
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
