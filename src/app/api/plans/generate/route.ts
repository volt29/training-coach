import { apiError, requireApiUser } from "@/lib/api";
import { generatePlanForUser } from "@/lib/services/plans";
import { generatePlanInputSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const input = generatePlanInputSchema.parse(await request.json());
    const plan = await generatePlanForUser(auth.userId, input);

    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
