import { generatedPlanSchema, validateGeneratedWorkouts } from "@/lib/validators";
import type { GeneratePlanInput, GeneratedWorkout } from "@/lib/validators";

export type GenerationContext = {
  profile: {
    level: string;
    weeklyVolumeKm: number | null;
    targetRace: string | null;
    notes: string | null;
  } | null;
  zones: Array<{
    type: string;
    name: string;
    minValue: number;
    maxValue: number;
    unit: string;
  }>;
  raceResults: Array<{
    distanceKm: number;
    resultSeconds: number;
    raceDate: Date;
    notes: string | null;
  }>;
};

export type AiGenerationResult = {
  workouts: GeneratedWorkout[];
  prompt: string;
  rawResponse: string | null;
  validationErrors: string | null;
};

type HuggingFaceChatClient = {
  chatCompletion(input: {
    model: string;
    messages: Array<{
      role: "system" | "user";
      content: string;
    }>;
    temperature: number;
    max_tokens: number;
  }): Promise<{
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    generated_text?: string;
  }>;
};

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const objectStart = candidate.indexOf("{");
  const arrayStart = candidate.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = Math.min(...starts);

  if (!Number.isFinite(start)) {
    throw new Error("Odpowiedź AI nie zawiera JSON.");
  }

  const lastObject = candidate.lastIndexOf("}");
  const lastArray = candidate.lastIndexOf("]");
  const end = Math.max(lastObject, lastArray);

  if (end <= start) {
    throw new Error("Odpowiedź AI zawiera niepełny JSON.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseAiPlanResponse(text: string, input: GeneratePlanInput) {
  const parsedJson = extractJson(text);
  const normalized = Array.isArray(parsedJson)
    ? { workouts: parsedJson }
    : parsedJson;
  const parsed = generatedPlanSchema.parse(normalized);

  return validateGeneratedWorkouts(parsed.workouts, input);
}

export function buildGenerationPrompt(
  input: GeneratePlanInput,
  context: GenerationContext,
  retryReason?: string
) {
  const retry = retryReason
    ? `\nPoprzednia odpowiedź była błędna: ${retryReason}. Zwróć poprawiony JSON.`
    : "";

  return `Jesteś trenerem biegania. Wygeneruj mikrocykl MVP wyłącznie dla sportu run.

Zasady twarde:
- Zwróć wyłącznie JSON, bez markdown.
- Format: {"workouts":[{"date":"YYYY-MM-DD","sport":"run","goal":"easy|tempo|intervals|longRun|recovery","title":"...","durationMin":45,"zoneName":"Z2","intensity":"niska","structure":"...","notes":"..."}]}
- Liczba treningów: ${input.workoutsCount}.
- Wszystkie daty muszą być w tygodniu zaczynającym się ${input.weekStart}.
- Maksymalnie jeden trening dziennie.
- Między treningami tempo, intervals i longRun musi być co najmniej jeden dzień bez mocnego bodźca.
- Cele procentowo: easy ${input.goals.easy}%, tempo ${input.goals.tempo}%, intervals ${input.goals.intervals}%, longRun ${input.goals.longRun}%, recovery ${input.goals.recovery}%.
- Strefy PACE mają minValue/maxValue jako sekundy na kilometr i unit "min/km"; w opisach tempa używaj formatu min:sek/km, nigdy m/s ani km/h.

Profil:
${JSON.stringify(context.profile ?? {}, null, 2)}

Strefy:
${JSON.stringify(context.zones, null, 2)}

Wyniki startowe:
${JSON.stringify(context.raceResults, null, 2)}
${retry}`;
}

export async function generateWithHuggingFace(
  input: GeneratePlanInput,
  context: GenerationContext
): Promise<AiGenerationResult | null> {
  const token = process.env.HF_TOKEN;

  if (!token) {
    return null;
  }

  const model = process.env.HF_MODEL ?? "openai/gpt-oss-120b:fastest";
  let prompt = buildGenerationPrompt(input, context);
  let lastError: string | null = null;
  let lastResponse: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 1 && lastError) {
      prompt = buildGenerationPrompt(input, context, lastError);
    }

    try {
      const { InferenceClient } = await import("@huggingface/inference");
      const client = new InferenceClient(token) as HuggingFaceChatClient;
      const response = await client.chatCompletion({
        model,
        messages: [
          {
            role: "system",
            content:
              "Zwracasz tylko poprawny JSON zgodny ze schematem. Nie dodawaj komentarzy."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1200
      });

      lastResponse =
        response?.choices?.[0]?.message?.content ??
        response?.generated_text ??
        JSON.stringify(response);

      const workouts = parseAiPlanResponse(lastResponse, input);

      return {
        workouts,
        prompt,
        rawResponse: lastResponse,
        validationErrors: null
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Nieznany błąd AI.";
    }
  }

  return {
    workouts: [],
    prompt,
    rawResponse: lastResponse,
    validationErrors: lastError
  };
}
