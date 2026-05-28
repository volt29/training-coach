import { Prisma } from "@prisma/client";
import { z } from "zod";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional()
});

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password)
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "Użytkownik z tym adresem email już istnieje." },
        { status: 409 }
      );
    }

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Nieprawidłowe dane rejestracji.", details: error.flatten() },
        { status: 400 }
      );
    }

    return Response.json({ error: "Nie udało się utworzyć konta." }, { status: 500 });
  }
}
