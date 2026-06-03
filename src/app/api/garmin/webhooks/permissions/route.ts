import { apiError } from "@/lib/api";
import { ingestGarminPermissionPayload, isGarminWebhookRequestAuthorized } from "@/lib/garmin";

export async function POST(request: Request) {
  try {
    if (!isGarminWebhookRequestAuthorized(request)) {
      return Response.json({ error: "Nieprawidlowy sekret webhooka Garmin." }, { status: 401 });
    }

    const payload = await request.json();
    const result = await ingestGarminPermissionPayload(payload);

    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
