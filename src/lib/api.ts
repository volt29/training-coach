import { ZodError } from "zod";

import { getCurrentUserId } from "@/lib/auth/require-user";
import { DomainError } from "@/lib/services/plans";

export async function requireApiUser() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return {
      userId: null,
      response: Response.json({ error: "Wymagane logowanie." }, { status: 401 })
    } as const;
  }

  return { userId, response: null } as const;
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Nieprawidłowe dane wejściowe.", details: error.flatten() },
      { status: 400 }
    );
  }

  if (error instanceof DomainError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return Response.json({ error: error.message }, { status });
    }
  }

  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ error: "Nieznany błąd." }, { status: 500 });
}
