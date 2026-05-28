import { addDays, parseISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { buildCoachInsights } from "@/lib/coach/insights";

export async function getCoachInsightsForUser(userId: string, weekStart: string) {
  const weekStartDate = parseISODate(weekStart);
  const firstWeekDate = addDays(weekStartDate, -21);

  const [profile, plans, raceResults] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    prisma.trainingPlan.findMany({
      where: {
        userId,
        weekStart: {
          gte: firstWeekDate,
          lte: weekStartDate
        }
      },
      include: {
        workouts: true
      },
      orderBy: {
        weekStart: "asc"
      }
    }),
    prisma.raceResult.findMany({
      where: { userId },
      orderBy: { raceDate: "desc" },
      take: 20
    })
  ]);

  return buildCoachInsights({
    profile,
    plans,
    raceResults,
    weekStart
  });
}
