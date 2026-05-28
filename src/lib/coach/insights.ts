import { addDays, parseISODate, toISODate } from "@/lib/dates";
import type { GoalAllocation } from "@/lib/validators";

type AthleteLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
type InsightWorkoutStatus = "PLANNED" | "ACCEPTED" | "DONE" | "SKIPPED" | "EXPORTED";

export type InsightProfile = {
  level?: AthleteLevel;
  targetRace?: string | null;
  weeklyVolumeKm?: number | null;
} | null;

export type InsightWorkout = {
  date: Date | string;
  goal: string;
  intensity: string;
  durationMin: number;
  status: InsightWorkoutStatus;
  title: string;
};

export type InsightPlan = {
  weekStart: Date | string;
  workouts: InsightWorkout[];
};

export type InsightRaceResult = {
  distanceKm: number;
  resultSeconds: number;
  raceDate: Date | string;
};

export type LoadSummary = {
  plannedWorkouts: number;
  resolvedWorkouts: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  plannedMinutes: number;
  completedMinutes: number;
  hardWorkoutCount: number;
  hardMinutes: number;
  qualityWorkoutCount: number;
  qualityMinutes: number;
  averageWorkoutMinutes: number;
  hardSharePercent: number;
  qualitySharePercent: number;
  completionRate: number;
  adherenceRate: number | null;
};

export type RaceTrend = {
  state: "progress" | "regression" | "stable" | "insufficient_data";
  label: string;
  detail: string;
  distanceKm: number | null;
  deltaPercent: number | null;
  deltaSeconds: number | null;
};

export type CoachRecommendation = {
  status: "progress" | "watch" | "deload" | "baseline";
  title: string;
  rationale: string;
  nextWorkoutsCount: number;
  weeklyMinutesTarget: number;
  planningFocus: string;
  suggestedGoals: GoalAllocation;
  actions: string[];
};

export type CoachInsightAlert = {
  level: "success" | "warning" | "danger";
  text: string;
};

export type CoachInsights = {
  currentWeek: LoadSummary;
  rollingFourWeeks: LoadSummary & {
    weeksWithPlans: number;
  };
  raceTrend: RaceTrend;
  recommendation: CoachRecommendation;
  alerts: CoachInsightAlert[];
};

const COMPLETED_STATUSES = new Set<InsightWorkoutStatus>(["DONE", "EXPORTED"]);
const RESOLVED_STATUSES = new Set<InsightWorkoutStatus>(["DONE", "EXPORTED", "SKIPPED"]);
const HARD_GOAL_MARKERS = ["tempo", "interval", "interwa", "longrun", "long run", "dlugi", "długi"];
const HARD_INTENSITY_MARKERS = ["wysoka", "prog", "threshold", "hard", "mocno"];
const QUALITY_GOAL_MARKERS = ["tempo", "interval", "interwa"];
const LEVEL_DEFAULT_MINUTES: Record<AthleteLevel, number> = {
  BEGINNER: 160,
  INTERMEDIATE: 250,
  ADVANCED: 380
};
const LEVEL_MINUTES_RANGE: Record<AthleteLevel, { min: number; max: number }> = {
  BEGINNER: { min: 90, max: 240 },
  INTERMEDIATE: { min: 150, max: 390 },
  ADVANCED: { min: 240, max: 560 }
};

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function sameISODate(left: Date | string, right: Date | string) {
  return toISODate(toDate(left)) === toISODate(toDate(right));
}

function completionRate(completed: number, planned: number) {
  return planned > 0 ? Math.round((completed / planned) * 100) : 0;
}

function adherenceRate(completed: number, resolved: number) {
  return resolved > 0 ? Math.round((completed / resolved) * 100) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

function isHardWorkout(workout: InsightWorkout) {
  const goal = workout.goal.toLowerCase().replace(/\s+/g, "");
  const title = workout.title.toLowerCase();
  const intensity = workout.intensity.toLowerCase();

  return (
    HARD_GOAL_MARKERS.some((marker) => goal.includes(marker) || title.includes(marker)) ||
    HARD_INTENSITY_MARKERS.some((marker) => intensity.includes(marker))
  );
}

function isQualityWorkout(workout: InsightWorkout) {
  const goal = workout.goal.toLowerCase().replace(/\s+/g, "");
  const title = workout.title.toLowerCase();
  const intensity = workout.intensity.toLowerCase();

  return (
    QUALITY_GOAL_MARKERS.some((marker) => goal.includes(marker) || title.includes(marker)) ||
    HARD_INTENSITY_MARKERS.some((marker) => intensity.includes(marker))
  );
}

function summarizeWorkouts(workouts: InsightWorkout[]): LoadSummary {
  const completedWorkouts = workouts.filter((workout) =>
    COMPLETED_STATUSES.has(workout.status)
  ).length;
  const resolvedWorkouts = workouts.filter((workout) =>
    RESOLVED_STATUSES.has(workout.status)
  ).length;
  const hardWorkouts = workouts.filter(isHardWorkout);
  const qualityWorkouts = workouts.filter(isQualityWorkout);
  const plannedMinutes = workouts.reduce((sum, workout) => sum + workout.durationMin, 0);
  const hardMinutes = hardWorkouts.reduce((sum, workout) => sum + workout.durationMin, 0);
  const qualityMinutes = qualityWorkouts.reduce((sum, workout) => sum + workout.durationMin, 0);

  return {
    plannedWorkouts: workouts.length,
    resolvedWorkouts,
    completedWorkouts,
    skippedWorkouts: workouts.filter((workout) => workout.status === "SKIPPED").length,
    plannedMinutes,
    completedMinutes: workouts
      .filter((workout) => COMPLETED_STATUSES.has(workout.status))
      .reduce((sum, workout) => sum + workout.durationMin, 0),
    hardWorkoutCount: hardWorkouts.length,
    hardMinutes,
    qualityWorkoutCount: qualityWorkouts.length,
    qualityMinutes,
    averageWorkoutMinutes:
      workouts.length > 0 ? Math.round(plannedMinutes / workouts.length) : 0,
    hardSharePercent: plannedMinutes > 0 ? Math.round((hardMinutes / plannedMinutes) * 100) : 0,
    qualitySharePercent:
      plannedMinutes > 0 ? Math.round((qualityMinutes / plannedMinutes) * 100) : 0,
    completionRate: completionRate(completedWorkouts, workouts.length),
    adherenceRate: adherenceRate(completedWorkouts, resolvedWorkouts)
  };
}

function formatSeconds(totalSeconds: number) {
  const absolute = Math.abs(totalSeconds);
  const minutes = Math.floor(absolute / 60);
  const seconds = absolute % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function analyzeRaceTrend(raceResults: InsightRaceResult[]): RaceTrend {
  const sortedResults = [...raceResults].sort(
    (left, right) => toDate(right.raceDate).getTime() - toDate(left.raceDate).getTime()
  );
  const grouped = new Map<string, InsightRaceResult[]>();

  for (const result of sortedResults) {
    const key = result.distanceKm.toFixed(1);
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }

  const comparable = sortedResults
    .map((result) => grouped.get(result.distanceKm.toFixed(1)) ?? [])
    .find((group) => group.length >= 2);

  if (!comparable) {
    return {
      state: "insufficient_data",
      label: "Za mało wyników",
      detail: "Dodaj co najmniej dwa wyniki na tym samym dystansie, aby wykryć postęp albo regres.",
      distanceKm: null,
      deltaPercent: null,
      deltaSeconds: null
    };
  }

  const [latest, previous] = comparable;
  const deltaSeconds = latest.resultSeconds - previous.resultSeconds;
  const deltaPercent = Number(((deltaSeconds / previous.resultSeconds) * 100).toFixed(1));
  const thresholdSeconds = Math.max(3, previous.resultSeconds * 0.005);

  if (deltaSeconds <= -thresholdSeconds) {
    return {
      state: "progress",
      label: `Postęp ${formatSeconds(deltaSeconds)}`,
      detail: `Ostatni wynik na ${latest.distanceKm} km jest lepszy od poprzedniego o ${formatSeconds(deltaSeconds)}.`,
      distanceKm: latest.distanceKm,
      deltaPercent,
      deltaSeconds
    };
  }

  if (deltaSeconds >= thresholdSeconds) {
    return {
      state: "regression",
      label: `Regres +${formatSeconds(deltaSeconds)}`,
      detail: `Ostatni wynik na ${latest.distanceKm} km jest wolniejszy od poprzedniego o ${formatSeconds(deltaSeconds)}.`,
      distanceKm: latest.distanceKm,
      deltaPercent,
      deltaSeconds
    };
  }

  return {
    state: "stable",
    label: "Stabilnie",
    detail: `Dwa ostatnie wyniki na ${latest.distanceKm} km są w praktyce na tym samym poziomie.`,
    distanceKm: latest.distanceKm,
    deltaPercent,
    deltaSeconds
  };
}

function baseWorkoutCount(profile: InsightProfile) {
  if (profile?.level === "ADVANCED" || (profile?.weeklyVolumeKm ?? 0) >= 65) {
    return 5;
  }

  if ((profile?.weeklyVolumeKm ?? 0) >= 35) {
    return 4;
  }

  return 3;
}

function baselineGoals(profile: InsightProfile): GoalAllocation {
  const target = profile?.targetRace?.toLowerCase() ?? "";

  if (profile?.level === "BEGINNER") {
    return { easy: 55, tempo: 10, intervals: 5, longRun: 15, recovery: 15 };
  }

  if (target.includes("maraton") || target.includes("42")) {
    return { easy: 45, tempo: 15, intervals: 10, longRun: 20, recovery: 10 };
  }

  if (target.includes("5 km") || target === "5k") {
    return { easy: 45, tempo: 15, intervals: 20, longRun: 10, recovery: 10 };
  }

  return { easy: 45, tempo: 20, intervals: 15, longRun: 15, recovery: 5 };
}

function targetWeeklyMinutes(profile: InsightProfile) {
  const level = profile?.level ?? "INTERMEDIATE";
  const range = LEVEL_MINUTES_RANGE[level];
  const fromVolume =
    typeof profile?.weeklyVolumeKm === "number" && profile.weeklyVolumeKm > 0
      ? profile.weeklyVolumeKm * 6
      : LEVEL_DEFAULT_MINUTES[level];

  return roundToNearestFive(clamp(fromVolume, range.min, range.max));
}

function adjustedMinutes(target: number, factor: number, profile: InsightProfile) {
  const level = profile?.level ?? "INTERMEDIATE";
  const range = LEVEL_MINUTES_RANGE[level];

  return roundToNearestFive(clamp(target * factor, range.min, range.max));
}

function buildRecommendation(params: {
  currentWeek: LoadSummary;
  hasCurrentPlan: boolean;
  profile: InsightProfile;
  raceTrend: RaceTrend;
  rollingFourWeeks: LoadSummary;
}): CoachRecommendation {
  const baseCount = baseWorkoutCount(params.profile);
  const baselineMinutes = targetWeeklyMinutes(params.profile);
  const resolvedEnoughForAdherence = params.rollingFourWeeks.resolvedWorkouts >= 3;
  const lowAdherence =
    resolvedEnoughForAdherence &&
    params.rollingFourWeeks.adherenceRate !== null &&
    params.rollingFourWeeks.adherenceRate < 70;
  const tooMuchIntensity =
    params.currentWeek.plannedMinutes > 0 &&
    (params.currentWeek.qualityWorkoutCount > 2 ||
      (params.currentWeek.qualityWorkoutCount >= 2 &&
        params.currentWeek.qualitySharePercent > 42));
  const tooMuchVolume =
    params.currentWeek.plannedMinutes > 0 &&
    params.currentWeek.plannedMinutes > baselineMinutes * 1.18;

  if (!params.hasCurrentPlan) {
    return {
      status: "baseline",
      title: "Utwórz tydzień bazowy",
      rationale: "Najprostszy kolejny krok to mikrocykl dopasowany do profilu, stref i ostatnich wyników.",
      nextWorkoutsCount: baseCount,
      weeklyMinutesTarget: baselineMinutes,
      planningFocus: "Stabilny tydzień z jednym lub dwoma akcentami i bez spiętrzenia mocnych dni.",
      suggestedGoals: baselineGoals(params.profile),
      actions: ["Wygeneruj tydzień bazowy", "Po każdym treningu oznacz wykonanie albo pominięcie"]
    };
  }

  if (
    params.currentWeek.skippedWorkouts >= 2 ||
    lowAdherence
  ) {
    return {
      status: "deload",
      title: "Obniż obciążenie",
      rationale:
        "Pominięte jednostki albo słaba realizacja rozliczonych treningów sugerują tydzień odciążający zamiast dokładania bodźców.",
      nextWorkoutsCount: Math.max(2, baseCount - 1),
      weeklyMinutesTarget: adjustedMinutes(baselineMinutes, 0.82, params.profile),
      planningFocus: "Odbudowa regularności, więcej biegu łatwego i tylko jeden kontrolowany akcent.",
      suggestedGoals: { easy: 55, tempo: 10, intervals: 5, longRun: 15, recovery: 15 },
      actions: ["Zmniejsz liczbę treningów", "Zostaw tylko jeden akcent", "Pilnuj snu i regeneracji"]
    };
  }

  if (tooMuchVolume || tooMuchIntensity) {
    return {
      status: "watch",
      title: "Uspokój rozkład bodźców",
      rationale:
        "Aktualny tydzień ma zbyt duży udział mocnych minut albo objętość powyżej bezpiecznego zakresu z profilu.",
      nextWorkoutsCount: baseCount,
      weeklyMinutesTarget: adjustedMinutes(baselineMinutes, 0.9, params.profile),
      planningFocus: "Więcej Z1/Z2, mniejszy udział interwałów i co najmniej dzień luzu między akcentami.",
      suggestedGoals: { easy: 55, tempo: 15, intervals: 5, longRun: 15, recovery: 10 },
      actions: ["Zmniejsz udział mocnych minut", "Nie łącz akcentów dzień po dniu", "Kontroluj odczucie zmęczenia"]
    };
  }

  if (params.raceTrend.state === "regression") {
    return {
      status: "watch",
      title: "Regres wyniku - kontroluj intensywność",
      rationale:
        "Ostatni porównywalny start był wolniejszy, więc następny tydzień powinien podbijać tlen i ograniczyć ryzyko przeciążenia.",
      nextWorkoutsCount: baseCount,
      weeklyMinutesTarget: adjustedMinutes(baselineMinutes, 0.95, params.profile),
      planningFocus: "Tlen i techniczna jakość zamiast dokładania mocnych interwałów.",
      suggestedGoals: { easy: 50, tempo: 15, intervals: 5, longRun: 15, recovery: 15 },
      actions: ["Zmniejsz udział interwałów", "Dodaj regenerację", "Sprawdź notatki o zmęczeniu"]
    };
  }

  if (
    params.raceTrend.state === "progress" &&
    params.rollingFourWeeks.adherenceRate !== null &&
    params.rollingFourWeeks.adherenceRate >= 80
  ) {
    return {
      status: "progress",
      title: "Można lekko progresować",
      rationale:
        "Wyniki idą w dobrą stronę, a rozliczone treningi są wykonywane regularnie, więc można ostrożnie zwiększyć bodziec.",
      nextWorkoutsCount: Math.min(7, baseCount + 1),
      weeklyMinutesTarget: adjustedMinutes(baselineMinutes, 1.08, params.profile),
      planningFocus: "Mała progresja objętości lub jedna dodatkowa łatwa jednostka, bez dokładania drugiego dnia pod rząd mocno.",
      suggestedGoals: { easy: 45, tempo: 20, intervals: 15, longRun: 15, recovery: 5 },
      actions: ["Dodaj jedną łatwą jednostkę lub 5-10% czasu", "Nie łącz dwóch mocnych dni", "Zostaw długi bieg w Z2"]
    };
  }

  return {
    status: "baseline",
    title: "Utrzymaj kontrolowany mikrocykl",
    rationale:
      "Dane nie pokazują wyraźnego regresu ani gotowości do mocniejszej progresji, więc najlepszy jest stabilny tydzień.",
    nextWorkoutsCount: baseCount,
    weeklyMinutesTarget: baselineMinutes,
    planningFocus: "Powtarzalność, jeden główny akcent jakościowy i długi bieg w komfortowej intensywności.",
    suggestedGoals: baselineGoals(params.profile),
    actions: ["Utrzymaj rozkład akcentów", "Oznaczaj wykonanie po każdym treningu", "Dodawaj wyniki kontrolne"]
  };
}

function buildAlerts(params: {
  currentWeek: LoadSummary;
  hasCurrentPlan: boolean;
  raceTrend: RaceTrend;
  rollingFourWeeks: LoadSummary & { weeksWithPlans: number };
}) {
  const alerts: CoachInsightAlert[] = [];

  if (!params.hasCurrentPlan) {
    alerts.push({ level: "warning", text: "Ten tydzien nie ma jeszcze planu do analizy." });
  }

  if (params.currentWeek.skippedWorkouts >= 2) {
    alerts.push({
      level: "danger",
      text: "W tym tygodniu sa co najmniej dwa pominiete treningi - rekomendowany jest deload."
    });
  }

  if (params.currentWeek.qualityWorkoutCount >= 3) {
    alerts.push({
      level: "warning",
      text: "Mikrocykl zawiera dużo mocnych bodźców. Zachowaj minimum jeden dzień luzu między akcentami."
    });
  }

  if (params.raceTrend.state === "progress") {
    alerts.push({ level: "success", text: "Ostatni porównywalny start wskazuje postęp." });
  }

  if (params.raceTrend.state === "regression") {
    alerts.push({ level: "danger", text: "Ostatni porównywalny start wskazuje regres." });
  }

  if (params.raceTrend.state === "insufficient_data") {
    alerts.push({
      level: "warning",
      text: "Brakuje dwóch wyników na tym samym dystansie do wiarygodnej oceny trendu."
    });
  }

  if (
    params.rollingFourWeeks.weeksWithPlans > 0 &&
    params.rollingFourWeeks.adherenceRate !== null &&
    params.rollingFourWeeks.adherenceRate >= 85
  ) {
    alerts.push({ level: "success", text: "Realizacja rozliczonych treningów jest wysoka." });
  }

  return alerts;
}

export function buildCoachInsights(params: {
  profile: InsightProfile;
  plans: InsightPlan[];
  raceResults: InsightRaceResult[];
  weekStart: string;
}): CoachInsights {
  const currentWeekStart = parseISODate(params.weekStart);
  const rollingStart = addDays(currentWeekStart, -21);
  const rollingPlans = params.plans.filter((plan) => {
    const planDate = toDate(plan.weekStart);
    return planDate >= rollingStart && planDate <= currentWeekStart;
  });
  const currentPlan = params.plans.find((plan) => sameISODate(plan.weekStart, currentWeekStart));
  const currentWeek = summarizeWorkouts(currentPlan?.workouts ?? []);
  const rollingWorkouts = rollingPlans.flatMap((plan) => plan.workouts);
  const rollingSummary = summarizeWorkouts(rollingWorkouts);
  const rollingFourWeeks = {
    ...rollingSummary,
    weeksWithPlans: new Set(rollingPlans.map((plan) => toISODate(toDate(plan.weekStart)))).size
  };
  const raceTrend = analyzeRaceTrend(params.raceResults);
  const recommendation = buildRecommendation({
    currentWeek,
    hasCurrentPlan: Boolean(currentPlan),
    profile: params.profile,
    raceTrend,
    rollingFourWeeks
  });

  return {
    currentWeek,
    rollingFourWeeks,
    raceTrend,
    recommendation,
    alerts: buildAlerts({
      currentWeek,
      hasCurrentPlan: Boolean(currentPlan),
      raceTrend,
      rollingFourWeeks
    })
  };
}
