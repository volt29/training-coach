import { apiError, requireApiUser } from "@/lib/api";
import { getGarminDashboard, refreshGarminConnectionPermissions } from "@/lib/garmin";

export async function POST() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    await refreshGarminConnectionPermissions(auth.userId);
    const dashboard = await getGarminDashboard(auth.userId);

    return Response.json(dashboard);
  } catch (error) {
    return apiError(error);
  }
}
