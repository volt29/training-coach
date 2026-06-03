import { apiError, requireApiUser } from "@/lib/api";
import { disconnectGarminConnection, getGarminDashboard } from "@/lib/garmin";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const dashboard = await getGarminDashboard(auth.userId);

    return Response.json(dashboard);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const disconnect = await disconnectGarminConnection(auth.userId);
    const dashboard = await getGarminDashboard(auth.userId);

    return Response.json({
      ...dashboard,
      disconnect
    });
  } catch (error) {
    return apiError(error);
  }
}
