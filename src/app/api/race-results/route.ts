import { apiError, requireApiUser } from "@/lib/api";
import { parseISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { raceResultInputSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const raceResults = await prisma.raceResult.findMany({
    where: { userId: auth.userId },
    orderBy: { raceDate: "desc" }
  });

  return Response.json({ raceResults });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const input = raceResultInputSchema.parse(await request.json());
    const raceResult = await prisma.raceResult.create({
      data: {
        userId: auth.userId,
        distanceKm: input.distanceKm,
        resultSeconds: input.resultSeconds,
        raceDate: parseISODate(input.raceDate),
        notes: input.notes
      }
    });

    return Response.json({ raceResult }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
