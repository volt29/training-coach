import { createFallbackWorkouts } from "@/lib/generation/fallback";
import { generateWithHuggingFace } from "@/lib/generation/ai";
import type { GenerationContext } from "@/lib/generation/ai";
import { validateGeneratedWorkouts } from "@/lib/validators";
import type { GeneratePlanInput } from "@/lib/validators";

export async function generateTrainingWorkouts(
  input: GeneratePlanInput,
  context: GenerationContext
) {
  const aiResult = await generateWithHuggingFace(input, context);

  if (aiResult?.workouts.length) {
    return {
      source: "HUGGING_FACE" as const,
      workouts: aiResult.workouts,
      prompt: aiResult.prompt,
      rawResponse: aiResult.rawResponse,
      validationErrors: null
    };
  }

  const fallbackWorkouts = validateGeneratedWorkouts(
    createFallbackWorkouts(input, context),
    input
  );

  return {
    source: "FALLBACK" as const,
    workouts: fallbackWorkouts,
    prompt: aiResult?.prompt ?? "HF_TOKEN nieustawiony. Użyto fallbacku regułowego.",
    rawResponse: aiResult?.rawResponse ?? null,
    validationErrors: aiResult?.validationErrors ?? null
  };
}
