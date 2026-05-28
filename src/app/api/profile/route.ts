import { apiError, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { profileInputSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: auth.userId }
  });

  return Response.json({ profile });
}

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const input = profileInputSchema.parse(await request.json());
    const profile = await prisma.athleteProfile.upsert({
      where: { userId: auth.userId },
      update: input,
      create: {
        ...input,
        userId: auth.userId
      }
    });

    return Response.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}
