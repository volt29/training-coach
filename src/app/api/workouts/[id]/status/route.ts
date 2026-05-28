import { apiError, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { workoutStatusSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const input = workoutStatusSchema.parse(await request.json());
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
      data: { status: input.status }
    });

    return Response.json({ workout: updatedWorkout });
  } catch (error) {
    return apiError(error);
  }
}
