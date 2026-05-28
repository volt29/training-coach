import { apiError, requireApiUser } from "@/lib/api";
import { getPlanForUser } from "@/lib/services/plans";
import { isoDateSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const weekStart = isoDateSchema.parse(searchParams.get("weekStart"));
    const plan = await getPlanForUser(auth.userId, weekStart);

    return Response.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
