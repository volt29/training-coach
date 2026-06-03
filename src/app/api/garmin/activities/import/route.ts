import { z } from "zod";

import { apiError, requireApiUser } from "@/lib/api";
import { parseISODate } from "@/lib/dates";
import {
  assertGarminImportRange,
  getGarminAdapter,
  getGarminDashboard,
  getRequiredGarminConnection,
  saveGarminActivitiesForUser
} from "@/lib/garmin";
import { isoDateSchema } from "@/lib/validators";

const importActivitiesSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema
  })
  .refine((value) => parseISODate(value.startDate) <= parseISODate(value.endDate), {
    message: "Data konca importu musi byc po dacie poczatku."
  });

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const input = importActivitiesSchema.parse(await request.json());
    const range = {
      startDate: parseISODate(input.startDate),
      endDate: parseISODate(input.endDate)
    };
    assertGarminImportRange(range);
    const connection = await getRequiredGarminConnection(auth.userId);
    const adapter = getGarminAdapter(connection);
    const activities = await adapter.fetchActivities(auth.userId, connection, range);

    const saveResult = await saveGarminActivitiesForUser(auth.userId, connection.id, activities);

    const dashboard = await getGarminDashboard(auth.userId);

    return Response.json({
      ...dashboard,
      importedCount: saveResult.savedCount,
      matchedWorkoutCount: saveResult.matchedWorkoutCount
    });
  } catch (error) {
    return apiError(error);
  }
}
