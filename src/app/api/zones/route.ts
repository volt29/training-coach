import { apiError, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { zonesInputSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const zones = await prisma.intensityZone.findMany({
    where: { userId: auth.userId },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }]
  });

  return Response.json({ zones });
}

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const input = zonesInputSchema.parse(await request.json());

    await prisma.$transaction([
      prisma.intensityZone.deleteMany({
        where: { userId: auth.userId }
      }),
      prisma.intensityZone.createMany({
        data: input.zones.map((zone) => ({
          userId: auth.userId,
          type: zone.type,
          name: zone.name,
          minValue: zone.minValue,
          maxValue: zone.maxValue,
          unit: zone.unit,
          sortOrder: zone.sortOrder
        }))
      })
    ]);

    const zones = await prisma.intensityZone.findMany({
      where: { userId: auth.userId },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }]
    });

    return Response.json({ zones });
  } catch (error) {
    return apiError(error);
  }
}
