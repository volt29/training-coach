import { apiError, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const deleted = await prisma.raceResult.deleteMany({
      where: {
        id,
        userId: auth.userId
      }
    });

    if (deleted.count === 0) {
      return Response.json({ error: "Nie znaleziono wyniku." }, { status: 404 });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
