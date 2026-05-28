import { apiError, requireApiUser } from "@/lib/api";
import { getCoachInsightsForUser } from "@/lib/services/coach";
import { isoDateSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const weekStart = isoDateSchema.parse(searchParams.get("weekStart"));
    const insights = await getCoachInsightsForUser(auth.userId, weekStart);

    return Response.json({ insights });
  } catch (error) {
    return apiError(error);
  }
}
