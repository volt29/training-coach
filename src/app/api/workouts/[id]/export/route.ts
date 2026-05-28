import { apiError, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { MockTrainingPeaksAdapter } from "@/lib/trainingpeaks";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const adapter = new MockTrainingPeaksAdapter();
    const exportResult = await adapter.exportWorkout(auth.userId, id);
    const workout = await prisma.workout.findFirst({
      where: {
        id,
        userId: auth.userId
      }
    });

    return Response.json({ export: exportResult, workout });
  } catch (error) {
    return apiError(error);
  }
}
