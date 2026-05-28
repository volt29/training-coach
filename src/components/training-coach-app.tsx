"use client";

import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  Dumbbell,
  LogOut,
  Move,
  Save,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wand2
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";

import { getMondayISO, getWeekDates } from "@/lib/dates";

type Profile = {
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  weeklyVolumeKm: number | null;
  targetRace: string | null;
  notes: string | null;
};

type Zone = {
  id?: string;
  type: "PACE" | "HEART_RATE";
  name: string;
  minValue: number;
  maxValue: number;
  unit: string;
  sortOrder: number;
};

type RaceResult = {
  id: string;
  distanceKm: number;
  resultSeconds: number;
  raceDate: string;
  notes: string | null;
};

type WorkoutStatus = "PLANNED" | "ACCEPTED" | "DONE" | "SKIPPED" | "EXPORTED";

type Workout = {
  id: string;
  date: string;
  dayIndex: number;
  sport: string;
  goal: string;
  title: string;
  durationMin: number;
  zoneName: string;
  intensity: string;
  structure: string;
  notes: string | null;
  status: WorkoutStatus;
};

type TrainingPlan = {
  id: string;
  weekStart: string;
  source: "HUGGING_FACE" | "FALLBACK";
  workouts: Workout[];
  requests?: Array<{
    validationErrors: string | null;
  }>;
};

type GoalAllocation = {
  easy: number;
  tempo: number;
  intervals: number;
  longRun: number;
  recovery: number;
};

type WorkspaceView = "setup" | "plan" | "review";

type LoadSummary = {
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

type CoachInsights = {
  currentWeek: LoadSummary;
  rollingFourWeeks: LoadSummary & {
    weeksWithPlans: number;
  };
  raceTrend: {
    state: "progress" | "regression" | "stable" | "insufficient_data";
    label: string;
    detail: string;
    distanceKm: number | null;
    deltaPercent: number | null;
    deltaSeconds: number | null;
  };
  recommendation: {
    status: "progress" | "watch" | "deload" | "baseline";
    title: string;
    rationale: string;
    nextWorkoutsCount: number;
    weeklyMinutesTarget: number;
    planningFocus: string;
    suggestedGoals: GoalAllocation;
    actions: string[];
  };
  alerts: Array<{
    level: "success" | "warning" | "danger";
    text: string;
  }>;
};

const defaultProfile: Profile = {
  level: "INTERMEDIATE",
  weeklyVolumeKm: 45,
  targetRace: "10 km",
  notes: ""
};

const defaultZones: Zone[] = [
  { type: "PACE", name: "Z1", minValue: 390, maxValue: 480, unit: "min/km", sortOrder: 1 },
  { type: "PACE", name: "Z2", minValue: 330, maxValue: 389, unit: "min/km", sortOrder: 2 },
  { type: "PACE", name: "Z3", minValue: 290, maxValue: 329, unit: "min/km", sortOrder: 3 },
  { type: "PACE", name: "Z4", minValue: 255, maxValue: 289, unit: "min/km", sortOrder: 4 },
  { type: "PACE", name: "Z5", minValue: 220, maxValue: 254, unit: "min/km", sortOrder: 5 },
  { type: "HEART_RATE", name: "Z1", minValue: 115, maxValue: 137, unit: "bpm", sortOrder: 1 },
  { type: "HEART_RATE", name: "Z2", minValue: 138, maxValue: 151, unit: "bpm", sortOrder: 2 },
  { type: "HEART_RATE", name: "Z3", minValue: 152, maxValue: 165, unit: "bpm", sortOrder: 3 },
  { type: "HEART_RATE", name: "Z4", minValue: 166, maxValue: 178, unit: "bpm", sortOrder: 4 },
  { type: "HEART_RATE", name: "Z5", minValue: 179, maxValue: 194, unit: "bpm", sortOrder: 5 }
];

const goalLabels: Record<keyof GoalAllocation, string> = {
  easy: "Spokojne",
  tempo: "Tempo",
  intervals: "Interwały",
  longRun: "Długi bieg",
  recovery: "Regeneracja"
};

const statusLabels: Record<WorkoutStatus, string> = {
  PLANNED: "Planowany",
  ACCEPTED: "Zaakceptowany",
  DONE: "Wykonany",
  SKIPPED: "Pominięty",
  EXPORTED: "Wyeksportowany"
};

const dayLabels = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

function secondsToTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function timeToSeconds(value: string) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatPaceSeconds(totalSeconds: number) {
  const roundedSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parsePaceSeconds(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  if (normalized.includes(":")) {
    const [minutesPart, secondsPart = ""] = normalized.split(":");
    const minutes = Number(minutesPart);
    const seconds = Number(secondsPart);
    if (
      !Number.isInteger(minutes) ||
      !Number.isInteger(seconds) ||
      secondsPart.length === 0 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return null;
    }
    return minutes * 60 + seconds;
  }

  const minutes = Number(normalized);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Błąd API.");
  }

  return data;
}

export function TrainingCoachApp() {
  const { data: session, status } = useSession();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("runner@example.com");
  const [password, setPassword] = useState("runner123");
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [zones, setZones] = useState<Zone[]>(defaultZones);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [raceDistance, setRaceDistance] = useState(10);
  const [raceTime, setRaceTime] = useState("00:45:00");
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [workoutsCount, setWorkoutsCount] = useState(4);
  const [goals, setGoals] = useState<GoalAllocation>({
    easy: 45,
    tempo: 20,
    intervals: 15,
    longRun: 15,
    recovery: 5
  });
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [insights, setInsights] = useState<CoachInsights | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<WorkspaceView>("plan");
  const [savedSetup, setSavedSetup] = useState({ profile: false, zones: false });

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const goalSum = Object.values(goals).reduce((sum, value) => sum + value, 0);
  const setupReady = savedSetup.profile && savedSetup.zones;

  const groupedWorkouts = useMemo(() => {
    const grouped = new Map<string, Workout[]>();
    for (const date of weekDates) {
      grouped.set(date, []);
    }
    for (const workout of plan?.workouts ?? []) {
      const date = normalizeDate(workout.date);
      grouped.set(date, [...(grouped.get(date) ?? []), workout]);
    }
    return grouped;
  }, [plan?.workouts, weekDates]);

  const statusCounts = useMemo(() => {
    const counts: Record<WorkoutStatus, number> = {
      PLANNED: 0,
      ACCEPTED: 0,
      DONE: 0,
      SKIPPED: 0,
      EXPORTED: 0
    };

    for (const workout of plan?.workouts ?? []) {
      counts[workout.status] += 1;
    }

    return counts;
  }, [plan?.workouts]);

  const planFingerprint = useMemo(
    () =>
      plan?.workouts
        .map((workout) =>
          [
            workout.id,
            workout.date,
            workout.durationMin,
            workout.goal,
            workout.status
          ].join(":")
        )
        .join("|") ?? "empty",
    [plan?.workouts]
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    async function loadInitialData() {
      try {
        const [profileResponse, zonesResponse, raceResponse] = await Promise.all([
          apiJson<{ profile: Profile | null }>("/api/profile"),
          apiJson<{ zones: Zone[] }>("/api/zones"),
          apiJson<{ raceResults: RaceResult[] }>("/api/race-results")
        ]);

        setProfile(profileResponse.profile ?? defaultProfile);
        setZones(zonesResponse.zones.length > 0 ? zonesResponse.zones : defaultZones);
        setRaceResults(raceResponse.raceResults);
        const setupIsReady = Boolean(profileResponse.profile) && zonesResponse.zones.length > 0;
        setSavedSetup({
          profile: Boolean(profileResponse.profile),
          zones: zonesResponse.zones.length > 0
        });
        if (!setupIsReady) {
          setActiveView("setup");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nie udało się pobrać danych.");
      }
    }

    void loadInitialData();
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;

    async function loadPlan() {
      try {
        const response = await apiJson<{ plan: TrainingPlan | null }>(
          `/api/plans?weekStart=${weekStart}`
        );
        setPlan(response.plan);
        setSelectedWorkout(response.plan?.workouts[0] ?? null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nie udało się pobrać planu.");
      }
    }

    void loadPlan();
  }, [status, weekStart]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let ignore = false;

    async function loadCoachInsights() {
      try {
        const response = await apiJson<{ insights: CoachInsights }>(
          `/api/coach/insights?weekStart=${weekStart}`
        );

        if (!ignore) {
          setInsights(response.insights);
        }
      } catch {
        if (!ignore) {
          setInsights(null);
        }
      }
    }

    void loadCoachInsights();

    return () => {
      ignore = true;
    };
  }, [planFingerprint, raceResults.length, status, weekStart]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (authMode === "register") {
        await apiJson("/api/register", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
      });

      if (result?.error) {
        throw new Error("Nieprawidłowy email lub hasło.");
      }

      if (authMode === "register") {
        setActiveView("setup");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zalogować.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{ profile: Profile }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile)
      });
      setProfile(response.profile);
      setSavedSetup((current) => ({ ...current, profile: true }));
      setMessage("Profil zapisany.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zapisać profilu.");
    } finally {
      setBusy(false);
    }
  }

  async function saveZones() {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{ zones: Zone[] }>("/api/zones", {
        method: "PUT",
        body: JSON.stringify({ zones })
      });
      setZones(response.zones);
      setSavedSetup((current) => ({ ...current, zones: true }));
      setMessage("Strefy zapisane.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zapisać stref.");
    } finally {
      setBusy(false);
    }
  }

  async function addRaceResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await apiJson<{ raceResult: RaceResult }>("/api/race-results", {
        method: "POST",
        body: JSON.stringify({
          distanceKm: raceDistance,
          resultSeconds: timeToSeconds(raceTime),
          raceDate: today,
          notes: "Wynik dodany ręcznie w MVP"
        })
      });
      setRaceResults((current) => [response.raceResult, ...current]);
      setMessage("Wynik startowy dodany.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się dodać wyniku.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePlan(
    overrides: Partial<{
      goals: GoalAllocation;
      weekStart: string;
      workoutsCount: number;
    }> = {},
    successMessage?: string
  ) {
    setBusy(true);
    setMessage("");
    const nextWeekStart = overrides.weekStart ?? weekStart;
    const nextWorkoutsCount = overrides.workoutsCount ?? workoutsCount;
    const nextGoals = overrides.goals ?? goals;
    try {
      if (overrides.workoutsCount) {
        setWorkoutsCount(overrides.workoutsCount);
      }

      if (overrides.goals) {
        setGoals(overrides.goals);
      }

      const response = await apiJson<{ plan: TrainingPlan }>("/api/plans/generate", {
        method: "POST",
        body: JSON.stringify({
          weekStart: nextWeekStart,
          workoutsCount: nextWorkoutsCount,
          goals: nextGoals
        })
      });
      setPlan(response.plan);
      setSelectedWorkout(response.plan.workouts[0] ?? null);
      setMessage(successMessage ?? (
        response.plan.source === "FALLBACK"
          ? "Plan wygenerowany fallbackiem regułowym."
          : "Plan wygenerowany przez Hugging Face."
      ));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się wygenerować planu.");
    } finally {
      setBusy(false);
    }
  }

  function applyCoachRecommendation() {
    if (!insights) return;

    setWorkoutsCount(insights.recommendation.nextWorkoutsCount);
    setGoals(insights.recommendation.suggestedGoals);
    setActiveView("plan");
    setMessage("Rekomendacja coacha zastosowana w kreatorze.");
  }

  async function generateCoachPlan() {
    if (!insights) return;

    await generatePlan(
      {
        workoutsCount: insights.recommendation.nextWorkoutsCount,
        goals: insights.recommendation.suggestedGoals
      },
      "Plan wygenerowany automatycznie na podstawie rekomendacji coacha."
    );
  }

  async function patchWorkout(id: string, payload: Partial<Workout>) {
    const response = await apiJson<{ workout: Workout }>(`/api/workouts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    setPlan((current) =>
      current
        ? {
            ...current,
            workouts: current.workouts.map((workout) =>
              workout.id === id ? response.workout : workout
            )
          }
        : current
    );
    setSelectedWorkout(response.workout);
    return response.workout;
  }

  async function moveWorkout(workoutId: string, date: string) {
    setBusy(true);
    setMessage("");
    try {
      await patchWorkout(workoutId, { date });
      setMessage("Trening przeniesiony.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się przenieść treningu.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptWorkout(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{ workout: Workout }>(`/api/workouts/${id}/accept`, {
        method: "POST"
      });
      setPlan((current) =>
        current
          ? {
              ...current,
              workouts: current.workouts.map((workout) =>
                workout.id === id ? response.workout : workout
              )
            }
          : current
      );
      setSelectedWorkout(response.workout);
      setMessage("Trening zaakceptowany.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zaakceptować treningu.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, nextStatus: WorkoutStatus) {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{ workout: Workout }>(`/api/workouts/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      setPlan((current) =>
        current
          ? {
              ...current,
              workouts: current.workouts.map((workout) =>
                workout.id === id ? response.workout : workout
              )
            }
          : current
      );
      setSelectedWorkout(response.workout);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zmienić statusu.");
    } finally {
      setBusy(false);
    }
  }

  async function exportWorkout(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{ workout: Workout }>(`/api/workouts/${id}/export`, {
        method: "POST"
      });
      setPlan((current) =>
        current && response.workout
          ? {
              ...current,
              workouts: current.workouts.map((workout) =>
                workout.id === id ? response.workout : workout
              )
            }
          : current
      );
      if (response.workout) {
        setSelectedWorkout(response.workout);
      }
      setMessage("Mock eksportu TrainingPeaks zapisany.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się wyeksportować treningu.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!session) {
    return (
      <AuthScreen
        authMode={authMode}
        busy={busy}
        email={email}
        message={message}
        password={password}
        setAuthMode={setAuthMode}
        setEmail={setEmail}
        setPassword={setPassword}
        onSubmit={handleAuth}
      />
    );
  }

  const hasPlan = Boolean(plan?.workouts.length);
  const viewMeta = {
    setup: {
      title: "Dane zawodnika",
      description: "Ustaw profil, wyniki i strefy, które będą podstawą planu."
    },
    plan: {
      title: "Plan tygodnia",
      description: "Dobierz obciążenie, wygeneruj tydzień i popraw poszczególne treningi."
    },
    review: {
      title: "Realizacja",
      description: "Śledź wykonanie, wykorzystaj rekomendację coacha i eksportuj jednostki."
    }
  } satisfies Record<WorkspaceView, { title: string; description: string }>;

  return (
    <div className="min-h-screen bg-white text-[#202124]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[268px_1fr]">
        <aside className="border-b border-[#d9dee3] bg-[#f8fafb] px-4 py-4 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-lg font-semibold text-[#123130]">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#007f7a] text-white">
                <Dumbbell size={19} />
              </span>
              Training Coach
            </div>
            <button
              aria-label="Wyloguj"
              className="focus-ring rounded-lg border border-[#d9dee3] bg-white p-2.5 text-[#5f6368] hover:text-[#202124] lg:hidden"
              type="button"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
          <p className="mt-4 hidden text-sm leading-6 text-[#5f6368] lg:block">
            Przejdź od ustawień zawodnika do gotowego tygodnia i realizacji treningów.
          </p>

          <WorkflowNavigation
            activeView={activeView}
            hasPlan={hasPlan}
            setupReady={setupReady}
            onChange={setActiveView}
          />

          <div className="mt-6 hidden border-t border-[#d9dee3] pt-5 lg:block">
            <p className="truncate text-sm text-[#5f6368]">{session.user?.email}</p>
            <button
              className="focus-ring mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#3c4043] hover:bg-white"
              type="button"
              onClick={() => void signOut()}
            >
              <LogOut size={16} />
              Wyloguj
            </button>
          </div>
        </aside>

        <main className="thin-scrollbar min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-10 border-b border-[#d9dee3] bg-white/95 px-4 py-4 backdrop-blur lg:px-7 lg:py-5">
            <div className="mx-auto flex max-w-[1540px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#007f7a]">
                  Etap {activeView === "setup" ? "1" : activeView === "plan" ? "2" : "3"} z 3
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {viewMeta[activeView].title}
                </h1>
                <p className="mt-1 text-sm text-[#5f6368]">{viewMeta[activeView].description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="week-start">
                  Tydzień
                </label>
                <input
                  className="focus-ring rounded-lg border border-[#c7cdd2] bg-white px-3 py-2.5 text-sm"
                  id="week-start"
                  type="date"
                  value={weekStart}
                  onChange={(event) => setWeekStart(event.target.value)}
                />
                {activeView === "plan" ? (
                  <button
                    className="focus-ring flex items-center gap-2 rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#005f5b]"
                    disabled={busy || goalSum !== 100 || !setupReady}
                    type="button"
                    onClick={() => void generatePlan()}
                  >
                    <Wand2 size={16} />
                    Generuj plan
                  </button>
                ) : (
                  <button
                    className="focus-ring flex items-center gap-2 rounded-lg border border-[#007f7a] bg-white px-4 py-2.5 text-sm font-semibold text-[#007f7a]"
                    type="button"
                    onClick={() => setActiveView("plan")}
                  >
                    <CalendarDays size={16} />
                    Przejdź do planu
                  </button>
                )}
              </div>
            </div>
          </header>

          {message ? (
            <div className="mx-auto max-w-[1540px] px-4 pt-4 lg:px-7">
              <div
                className="rounded-lg border border-[#b9ddda] bg-[#effbf9] px-4 py-3 text-sm text-[#134b48]"
                role="status"
              >
                {message}
              </div>
            </div>
          ) : null}

          <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 lg:px-7">
            <WorkflowProgress
              activeView={activeView}
              hasPlan={hasPlan}
              setupReady={setupReady}
            />

            {activeView === "setup" ? (
              <>
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1fr)]">
                  <ProfilePanel
                    busy={busy}
                    profile={profile}
                    raceDistance={raceDistance}
                    raceResults={raceResults}
                    raceTime={raceTime}
                    setProfile={setProfile}
                    setRaceDistance={setRaceDistance}
                    setRaceTime={setRaceTime}
                    onAddRaceResult={addRaceResult}
                    onSaveProfile={saveProfile}
                  />
                  <ZonesPanel
                    busy={busy}
                    zones={zones}
                    setZones={setZones}
                    onSaveZones={saveZones}
                  />
                </div>
                <NextStepCard
                  description="Gdy profil i strefy odzwierciedlają Twoją formę, ułóż parametry najbliższego tygodnia."
                  label="Przejdź do planowania"
                  onClick={() => setActiveView("plan")}
                  title="Dane gotowe do użycia?"
                />
              </>
            ) : null}

            {activeView === "plan" ? (
              <>
                <WizardPanel
                  busy={busy}
                  goals={goals}
                  goalSum={goalSum}
                  insights={insights}
                  setGoals={setGoals}
                  setWorkoutsCount={setWorkoutsCount}
                  workoutsCount={workoutsCount}
                  onApplyRecommendation={applyCoachRecommendation}
                  onGenerateRecommendation={generateCoachPlan}
                />
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <CalendarPanel
                    groupedWorkouts={groupedWorkouts}
                    selectedWorkoutId={selectedWorkout?.id ?? null}
                    weekDates={weekDates}
                    onMoveWorkout={moveWorkout}
                    onSelectWorkout={setSelectedWorkout}
                  />
                  <section className="space-y-5 xl:sticky xl:top-32">
                    <WorkoutEditor
                      key={
                        selectedWorkout
                          ? `${selectedWorkout.id}-${selectedWorkout.status}-${selectedWorkout.date}-${selectedWorkout.title}-${selectedWorkout.durationMin}`
                          : "empty-workout"
                      }
                      busy={busy}
                      workout={selectedWorkout}
                      onAccept={acceptWorkout}
                      onChangeStatus={changeStatus}
                      onExport={exportWorkout}
                      onPatch={patchWorkout}
                    />
                    <SummaryPanel
                      goals={goals}
                      plan={plan}
                      statusCounts={statusCounts}
                      workoutsCount={workoutsCount}
                    />
                  </section>
                </div>
              </>
            ) : null}

            {activeView === "review" ? (
              <>
                <CoachPanel
                  busy={busy}
                  insights={insights}
                  onApplyRecommendation={applyCoachRecommendation}
                  onGenerateRecommendation={generateCoachPlan}
                />
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <CalendarPanel
                    groupedWorkouts={groupedWorkouts}
                    selectedWorkoutId={selectedWorkout?.id ?? null}
                    weekDates={weekDates}
                    onMoveWorkout={moveWorkout}
                    onSelectWorkout={setSelectedWorkout}
                  />
                  <section className="space-y-5 xl:sticky xl:top-32">
                    <WorkoutEditor
                      key={
                        selectedWorkout
                          ? `${selectedWorkout.id}-${selectedWorkout.status}-${selectedWorkout.date}-${selectedWorkout.title}-${selectedWorkout.durationMin}`
                          : "empty-workout-review"
                      }
                      busy={busy}
                      workout={selectedWorkout}
                      onAccept={acceptWorkout}
                      onChangeStatus={changeStatus}
                      onExport={exportWorkout}
                      onPatch={patchWorkout}
                    />
                    <SummaryPanel
                      goals={goals}
                      plan={plan}
                      statusCounts={statusCounts}
                      workoutsCount={workoutsCount}
                    />
                  </section>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-white text-sm text-[#5f6368]">
      Ładowanie Training Coach...
    </div>
  );
}

function AuthScreen(props: {
  authMode: "login" | "register";
  busy: boolean;
  email: string;
  message: string;
  password: string;
  setAuthMode: (mode: "login" | "register") => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_440px]">
      <section className="hidden border-r border-[#d9dee3] bg-[#f8fafb] p-8 lg:block">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[#007f7a] text-white">
            <Dumbbell size={18} />
          </span>
          Training Coach
        </div>
        <div className="mt-8 grid max-w-5xl grid-cols-7 gap-2">
          {dayLabels.map((label, index) => (
            <div className="min-h-[560px] rounded-md border border-[#d9dee3] bg-white p-3" key={label}>
              <div className="text-xs font-semibold uppercase text-[#5f6368]">{label}</div>
              {index === 1 ? (
                <div className="mt-4 rounded-md border-l-4 border-[#e6634f] bg-[#fff7f5] p-3 text-sm">
                  <div className="font-semibold">Interwały krótkie</div>
                  <div className="mt-1 text-[#5f6368]">55 min · Z4</div>
                </div>
              ) : null}
              {index === 4 ? (
                <div className="mt-4 rounded-md border-l-4 border-[#007f7a] bg-[#effbf9] p-3 text-sm">
                  <div className="font-semibold">Tempo progowe</div>
                  <div className="mt-1 text-[#5f6368]">60 min · Z3</div>
                </div>
              ) : null}
              {index === 6 ? (
                <div className="mt-4 rounded-md border-l-4 border-[#2f8d46] bg-[#f0faf2] p-3 text-sm">
                  <div className="font-semibold">Długi bieg</div>
                  <div className="mt-1 text-[#5f6368]">85 min · Z2</div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm rounded-md border border-[#d9dee3] bg-white p-6 shadow-sm"
          onSubmit={props.onSubmit}
        >
          <div className="flex items-center gap-2 text-lg font-semibold lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#007f7a] text-white">
              <Dumbbell size={18} />
            </span>
            Training Coach
          </div>
          <h1 className="mt-6 text-xl font-semibold">
            {props.authMode === "login" ? "Zaloguj do planera" : "Utwórz konto zawodnika"}
          </h1>
          <p className="mt-2 text-sm text-[#5f6368]">
            Dane treningowe są przypisane do zalogowanego użytkownika.
          </p>
          <label className="mt-5 block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            className="focus-ring mt-1 w-full rounded-md border border-[#c7cdd2] px-3 py-2 text-sm"
            id="email"
            type="email"
            value={props.email}
            onChange={(event) => props.setEmail(event.target.value)}
          />
          <label className="mt-4 block text-sm font-medium" htmlFor="password">
            Hasło
          </label>
          <input
            className="focus-ring mt-1 w-full rounded-md border border-[#c7cdd2] px-3 py-2 text-sm"
            id="password"
            minLength={8}
            type="password"
            value={props.password}
            onChange={(event) => props.setPassword(event.target.value)}
          />
          {props.message ? <p className="mt-3 text-sm text-[#c24135]">{props.message}</p> : null}
          <button
            className="focus-ring mt-5 w-full rounded-md bg-[#007f7a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005f5b]"
            disabled={props.busy}
            type="submit"
          >
            {props.authMode === "login" ? "Zaloguj" : "Zarejestruj i zaloguj"}
          </button>
          <button
            className="focus-ring mt-3 w-full rounded-md border border-[#d9dee3] px-4 py-2 text-sm font-semibold text-[#202124]"
            type="button"
            onClick={() => props.setAuthMode(props.authMode === "login" ? "register" : "login")}
          >
            {props.authMode === "login" ? "Nie mam konta" : "Mam już konto"}
          </button>
        </form>
      </section>
    </main>
  );
}

const workflowItems: Array<{
  id: WorkspaceView;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof UserRound;
}> = [
  {
    id: "setup",
    label: "Dane zawodnika",
    shortLabel: "Dane",
    description: "Profil i strefy",
    icon: UserRound
  },
  {
    id: "plan",
    label: "Zaplanuj tydzień",
    shortLabel: "Plan",
    description: "Kalendarz i edycja",
    icon: CalendarDays
  },
  {
    id: "review",
    label: "Realizacja",
    shortLabel: "Realizacja",
    description: "Coach i eksport",
    icon: BarChart3
  }
];

function WorkflowNavigation(props: {
  activeView: WorkspaceView;
  hasPlan: boolean;
  setupReady: boolean;
  onChange: (view: WorkspaceView) => void;
}) {
  return (
    <nav
      aria-label="Główne etapy"
      className="mt-5 grid grid-cols-3 gap-2 lg:mt-8 lg:grid-cols-1 lg:gap-3"
    >
      {workflowItems.map((item, index) => {
        const Icon = item.icon;
        const active = props.activeView === item.id;
        const completed =
          (item.id === "setup" && props.setupReady) || (item.id === "plan" && props.hasPlan);

        return (
          <button
            aria-current={active ? "step" : undefined}
            className={clsx(
              "focus-ring flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition sm:flex-row sm:justify-start sm:gap-3 sm:px-2.5 sm:py-3 sm:text-left lg:px-3",
              active
                ? "border-[#b9ddda] bg-white text-[#007f7a] shadow-sm"
                : "border-transparent text-[#3c4043] hover:border-[#e2e8eb] hover:bg-white"
            )}
            key={item.id}
            type="button"
            onClick={() => props.onChange(item.id)}
          >
            <span
              className={clsx(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                active
                  ? "bg-[#007f7a] text-white"
                  : completed
                    ? "bg-[#e3f4f2] text-[#007f7a]"
                    : "bg-white text-[#5f6368]"
              )}
            >
              {completed && !active ? <Check size={16} /> : active ? <Icon size={16} /> : index + 1}
            </span>
            <span className="hidden min-w-0 lg:block">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs text-[#5f6368]">{item.description}</span>
            </span>
            <span className="whitespace-nowrap text-[11px] font-semibold leading-tight sm:text-xs lg:hidden">
              {item.shortLabel}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function WorkflowProgress(props: {
  activeView: WorkspaceView;
  hasPlan: boolean;
  setupReady: boolean;
}) {
  return (
    <section
      aria-label="Postęp planowania"
      className="hidden gap-3 rounded-xl border border-[#e2e8eb] bg-[#f8fafb] p-3 sm:grid sm:grid-cols-3 sm:gap-0 sm:p-4"
    >
      {workflowItems.map((item, index) => {
        const active = item.id === props.activeView;
        const completed =
          (item.id === "setup" && props.setupReady) || (item.id === "plan" && props.hasPlan);

        return (
          <div
            className={clsx(
              "flex items-center gap-3 sm:border-l sm:border-[#d9dee3] sm:px-4 sm:first:border-l-0 sm:first:pl-0",
              !active && "text-[#5f6368]"
            )}
            key={item.id}
          >
            <span
              className={clsx(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                active
                  ? "bg-[#007f7a] text-white"
                  : completed
                    ? "bg-[#e3f4f2] text-[#007f7a]"
                    : "border border-[#d9dee3] bg-white"
              )}
            >
              {completed && !active ? <Check size={16} /> : index + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="hidden text-xs text-[#5f6368] sm:block">{item.description}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function NextStepCard(props: {
  description: string;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[#b9ddda] bg-[#effbf9] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-[#123130]">{props.title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#456461]">{props.description}</p>
      </div>
      <button
        className="focus-ring flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white"
        type="button"
        onClick={props.onClick}
      >
        {props.label}
        <ChevronRight size={16} />
      </button>
    </section>
  );
}

function Panel({
  children,
  description,
  title,
  icon: Icon
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
  icon: typeof UserRound;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-[#d9dee3] bg-white shadow-[0_1px_3px_rgba(22,35,33,0.04)]">
      <div className="flex items-start gap-3 border-b border-[#e2e8eb] px-4 py-4 sm:px-5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf7f6] text-[#007f7a]">
          <Icon size={17} />
        </span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-[#5f6368]">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function ProfilePanel(props: {
  busy: boolean;
  profile: Profile;
  raceDistance: number;
  raceResults: RaceResult[];
  raceTime: string;
  setProfile: (profile: Profile) => void;
  setRaceDistance: (value: number) => void;
  setRaceTime: (value: string) => void;
  onAddRaceResult: (event: FormEvent<HTMLFormElement>) => void;
  onSaveProfile: () => void;
}) {
  return (
    <Panel
      title="Profil zawodnika"
      description="Podstawowe dane pozwalają dopasować objętość i rodzaj bodźców."
      icon={UserRound}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium" htmlFor="level">
          Poziom
          <select
            className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            id="level"
            value={props.profile.level}
            onChange={(event) =>
              props.setProfile({ ...props.profile, level: event.target.value as Profile["level"] })
            }
          >
            <option value="BEGINNER">Początkujący</option>
            <option value="INTERMEDIATE">Średniozaawansowany</option>
            <option value="ADVANCED">Zaawansowany</option>
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="volume">
          Tygodniowy kilometraż
          <input
            className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            id="volume"
            min={0}
            type="number"
            value={props.profile.weeklyVolumeKm ?? 0}
            onChange={(event) =>
              props.setProfile({
                ...props.profile,
                weeklyVolumeKm: Number(event.target.value)
              })
            }
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2" htmlFor="target">
          Cel startowy
          <input
            className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            id="target"
            value={props.profile.targetRace ?? ""}
            onChange={(event) =>
              props.setProfile({ ...props.profile, targetRace: event.target.value })
            }
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2" htmlFor="notes">
          Notatki
          <textarea
            className="focus-ring mt-2 min-h-20 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            id="notes"
            value={props.profile.notes ?? ""}
            onChange={(event) => props.setProfile({ ...props.profile, notes: event.target.value })}
          />
        </label>
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2"
          disabled={props.busy}
          type="button"
          onClick={props.onSaveProfile}
        >
          <Save size={16} />
          Zapisz profil
        </button>
      </div>

      <form className="mt-6 border-t border-[#e2e8eb] pt-5" onSubmit={props.onAddRaceResult}>
        <h3 className="text-sm font-semibold">Wynik odniesienia</h3>
        <p className="mt-1 text-sm leading-5 text-[#5f6368]">
          Dodaj ostatni start, aby coach mógł oceniać kierunek formy.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.25fr_auto] sm:items-end">
          <label className="text-xs font-medium text-[#5f6368]">
            Dystans (km)
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm text-[#202124]"
              min={1}
              step={0.1}
              type="number"
              value={props.raceDistance}
              onChange={(event) => props.setRaceDistance(Number(event.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-[#5f6368]">
            Czas (hh:mm:ss)
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm text-[#202124]"
              value={props.raceTime}
              onChange={(event) => props.setRaceTime(event.target.value)}
            />
          </label>
          <button
            className="focus-ring rounded-lg border border-[#007f7a] px-3 py-2.5 text-sm font-semibold text-[#007f7a]"
            disabled={props.busy}
            type="submit"
          >
            Dodaj
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {props.raceResults.slice(0, 4).map((result) => (
            <div
              className="flex items-center justify-between rounded-lg bg-[#f8fafb] px-3 py-2.5 text-sm"
              key={result.id}
            >
              <span>{result.distanceKm} km</span>
              <span className="font-mono text-xs">{secondsToTime(result.resultSeconds)}</span>
            </div>
          ))}
        </div>
      </form>
    </Panel>
  );
}

function ZonesPanel(props: {
  busy: boolean;
  zones: Zone[];
  setZones: (zones: Zone[]) => void;
  onSaveZones: () => void;
}) {
  function updateZone(index: number, patch: Partial<Zone>) {
    props.setZones(
      props.zones.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, ...patch } : zone))
    );
  }

  return (
    <Panel
      title="Strefy intensywności"
      description="Utrzymuj osobno progi tempa i tętna używane w treningach."
      icon={Activity}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {(["PACE", "HEART_RATE"] as const).map((type) => (
          <fieldset className="rounded-xl border border-[#e2e8eb] p-3" key={type}>
            <legend className="px-2 text-sm font-semibold">
              {type === "PACE" ? "Tempo" : "Tętno"}
            </legend>
            <div className="mb-2 grid grid-cols-[42px_1fr_1fr_52px] gap-2 px-1 text-xs text-[#5f6368]">
              <span>Strefa</span>
              <span>Od</span>
              <span>Do</span>
              <span>Jedn.</span>
            </div>
            <div className="space-y-2">
              {props.zones.map((zone, index) =>
                zone.type !== type ? null : (
                  <div
                    className="grid grid-cols-[42px_1fr_1fr_52px] gap-2 text-sm"
                    key={`${zone.type}-${zone.name}-${index}`}
                  >
                    <span className="rounded-lg bg-[#f8fafb] px-2 py-2.5 text-xs font-semibold text-[#5f6368]">
                      {zone.name}
                    </span>
                    {type === "PACE" ? (
                      <PaceInput
                        ariaLabel={`Tempo ${zone.name} od`}
                        value={zone.minValue}
                        onChange={(value) => updateZone(index, { minValue: value })}
                      />
                    ) : (
                      <input
                        aria-label={`Tętno ${zone.name} od`}
                        className="focus-ring min-w-0 rounded-lg border border-[#c7cdd2] px-2 py-2"
                        step="1"
                        type="number"
                        value={zone.minValue}
                        onChange={(event) =>
                          updateZone(index, { minValue: Number(event.target.value) })
                        }
                      />
                    )}
                    {type === "PACE" ? (
                      <PaceInput
                        ariaLabel={`Tempo ${zone.name} do`}
                        value={zone.maxValue}
                        onChange={(value) => updateZone(index, { maxValue: value })}
                      />
                    ) : (
                      <input
                        aria-label={`Tętno ${zone.name} do`}
                        className="focus-ring min-w-0 rounded-lg border border-[#c7cdd2] px-2 py-2"
                        step="1"
                        type="number"
                        value={zone.maxValue}
                        onChange={(event) =>
                          updateZone(index, { maxValue: Number(event.target.value) })
                        }
                      />
                    )}
                    <span className="rounded-lg bg-[#f8fafb] px-2 py-2.5 text-xs text-[#5f6368]">
                      {zone.unit}
                    </span>
                  </div>
                )
              )}
            </div>
          </fieldset>
        ))}
      </div>
      <button
        className="focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[#007f7a] px-4 py-2.5 text-sm font-semibold text-[#007f7a]"
        disabled={props.busy}
        type="button"
        onClick={props.onSaveZones}
      >
        <ShieldCheck size={16} />
        Zapisz strefy
      </button>
    </Panel>
  );
}

function PaceInput(props: {
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const formattedValue = formatPaceSeconds(props.value);

  return (
    <input
      aria-label={props.ariaLabel}
      className="focus-ring min-w-0 rounded-lg border border-[#c7cdd2] px-2 py-2 font-mono tabular-nums"
      defaultValue={formattedValue}
      inputMode="numeric"
      key={`${props.ariaLabel}-${formattedValue}`}
      placeholder="5:00"
      type="text"
      onBlur={(event) => {
        const nextValue = parsePaceSeconds(event.currentTarget.value);
        if (nextValue !== null) {
          props.onChange(nextValue);
          event.currentTarget.value = formatPaceSeconds(nextValue);
        } else {
          event.currentTarget.value = formattedValue;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function WizardPanel(props: {
  busy: boolean;
  goals: GoalAllocation;
  goalSum: number;
  insights: CoachInsights | null;
  workoutsCount: number;
  setGoals: (goals: GoalAllocation) => void;
  setWorkoutsCount: (value: number) => void;
  onApplyRecommendation: () => void;
  onGenerateRecommendation: () => void;
}) {
  const recommendation = props.insights?.recommendation;

  return (
    <Panel
      title="Parametry planu"
      description="Najprościej: użyj rekomendacji coacha. Ręcznie zmieniaj tylko wtedy, gdy chcesz świadomie skorygować tydzień."
      icon={Target}
    >
      {recommendation ? (
        <div className="rounded-lg border border-[#b9ddda] bg-[#effbf9] p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
            <div>
              <div className="text-sm font-semibold text-[#123130]">{recommendation.title}</div>
              <p className="mt-1 text-sm leading-6 text-[#315955]">
                {recommendation.rationale}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[#007f7a]">
                Fokus tygodnia
              </p>
              <p className="mt-1 text-sm leading-6 text-[#315955]">
                {recommendation.planningFocus}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Metric label="Treningi" value={`${recommendation.nextWorkoutsCount}`} />
              <Metric label="Minuty" value={`${recommendation.weeklyMinutesTarget}`} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#007f7a] bg-white px-4 py-2.5 text-sm font-semibold text-[#007f7a]"
              disabled={props.busy}
              type="button"
              onClick={props.onApplyRecommendation}
            >
              <Check size={16} />
              Użyj rekomendacji
            </button>
            <button
              className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white"
              disabled={props.busy}
              type="button"
              onClick={props.onGenerateRecommendation}
            >
              <Wand2 size={16} />
              Generuj optymalny plan
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={clsx(
          "grid gap-5 md:grid-cols-[200px_1fr] md:items-start",
          recommendation && "mt-5 border-t border-[#e2e8eb] pt-5"
        )}
      >
        <label className="block text-sm font-medium">
          Liczba treningów
          <input
            className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            max={7}
            min={1}
            type="number"
            value={props.workoutsCount}
            onChange={(event) => props.setWorkoutsCount(Number(event.target.value))}
          />
        </label>
        <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <legend className="sr-only">Rozkład celów w procentach</legend>
          {(Object.keys(goalLabels) as Array<keyof GoalAllocation>).map((key) => (
            <label className="block text-xs font-medium text-[#5f6368]" key={key}>
              {goalLabels[key]}
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-2 py-2.5 text-sm text-[#202124]"
                min={0}
                max={100}
                type="number"
                value={props.goals[key]}
                onChange={(event) =>
                  props.setGoals({
                    ...props.goals,
                    [key]: Number(event.target.value)
                  })
                }
              />
            </label>
          ))}
        </fieldset>
      </div>
      <div
        className={clsx(
          "mt-4 flex items-center justify-between rounded-lg px-3 py-2.5 text-sm",
          props.goalSum === 100 ? "bg-[#edf7f6]" : "bg-[#fff7f5]",
          props.goalSum === 100 ? "text-[#2f8d46]" : "text-[#c24135]"
        )}
      >
        <span>Suma celów: {props.goalSum}%</span>
        <span className="font-semibold">
          {props.goalSum === 100 ? "Gotowe do generowania" : "Wymagane 100%"}
        </span>
      </div>
    </Panel>
  );
}

function CalendarPanel(props: {
  groupedWorkouts: Map<string, Workout[]>;
  selectedWorkoutId: string | null;
  weekDates: string[];
  onMoveWorkout: (workoutId: string, date: string) => void;
  onSelectWorkout: (workout: Workout) => void;
}) {
  return (
    <Panel
      title="Kalendarz tygodniowy"
      description="Wybierz jednostkę, aby ją edytować. Na komputerze możesz przeciągać treningi między dniami."
      icon={CalendarDays}
    >
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-7">
        {props.weekDates.map((date, index) => {
          const dayWorkouts = props.groupedWorkouts.get(date) ?? [];

          return (
            <div
              className="rounded-xl border border-[#e2e8eb] bg-[#f8fafb] p-2.5 2xl:min-h-[420px]"
              data-testid={`day-${date}`}
              key={date}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const workoutId = event.dataTransfer.getData("text/plain");
                if (workoutId) {
                  void props.onMoveWorkout(workoutId, date);
                }
              }}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="flex items-baseline gap-2 2xl:block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                    {dayLabels[index]}
                  </div>
                  <div className="text-sm font-semibold">{date.slice(5)}</div>
                </div>
                <Move size={15} className="hidden text-[#9aa0a6] 2xl:block" />
              </div>
              <div className="space-y-2">
                {dayWorkouts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#d9dee3] bg-white/60 px-3 py-4 text-center text-xs text-[#7b8286]">
                    Odpoczynek
                  </div>
                ) : null}
                {dayWorkouts.map((workout) => (
                  <button
                    className={clsx(
                      "focus-ring w-full rounded-lg border bg-white p-3 text-left text-sm transition hover:border-[#007f7a]",
                      props.selectedWorkoutId === workout.id
                        ? "border-[#007f7a] shadow-[inset_3px_0_0_#007f7a]"
                        : "border-[#d9dee3]"
                    )}
                    data-testid={`workout-${workout.id}`}
                    draggable
                    key={workout.id}
                    type="button"
                    onClick={() => props.onSelectWorkout(workout)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", workout.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold leading-5">{workout.title}</span>
                      <span
                        className={clsx(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          workout.status === "EXPORTED" || workout.status === "DONE"
                            ? "bg-[#eaf7ed] text-[#2f8d46]"
                            : workout.status === "SKIPPED"
                              ? "bg-[#fff4ef] text-[#c24135]"
                              : "bg-[#edf7f6] text-[#007f7a]"
                        )}
                      >
                        {statusLabels[workout.status]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5f6368]">
                      <span>{workout.durationMin} min</span>
                      <span>·</span>
                      <span>{workout.zoneName}</span>
                      <span>·</span>
                      <span>{workout.goal}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#3c4043] 2xl:line-clamp-3">
                      {workout.structure}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CoachPanel(props: {
  busy: boolean;
  insights: CoachInsights | null;
  onApplyRecommendation: () => void;
  onGenerateRecommendation: () => void;
}) {
  if (!props.insights) {
    return (
      <Panel
        title="Coach i rekomendacje"
        description="Ocena pojawi się po zapisaniu danych i utworzeniu planu."
        icon={Bot}
      >
        <p className="text-sm text-[#5f6368]">
          Rekomendacje pojawią się po wczytaniu planu, wyników i statusów treningów.
        </p>
      </Panel>
    );
  }

  const recommendation = props.insights.recommendation;
  const trendIcon =
    props.insights.raceTrend.state === "regression" ? (
      <TrendingDown size={16} className="text-[#c24135]" />
    ) : (
      <TrendingUp size={16} className="text-[#2f8d46]" />
    );
  const toneClass =
    recommendation.status === "deload" || recommendation.status === "watch"
      ? "border-[#f3b29f] bg-[#fff7f5]"
      : recommendation.status === "progress"
        ? "border-[#9bd8ad] bg-[#f0faf2]"
        : "border-[#b9ddda] bg-[#effbf9]";

  return (
    <Panel
      title="Coach i rekomendacje"
      description="Sprawdź realizację i zastosuj proponowane obciążenie kolejnego tygodnia."
      icon={Bot}
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Realizacja tyg." value={`${props.insights.currentWeek.completionRate}%`} />
        <Metric
          label="Czas wykonany"
          value={`${props.insights.currentWeek.completedMinutes}/${props.insights.currentWeek.plannedMinutes} min`}
        />
        <Metric
          label="4 tygodnie"
          value={
            props.insights.rollingFourWeeks.adherenceRate === null
              ? "brak"
              : `${props.insights.rollingFourWeeks.adherenceRate}%`
          }
        />
        <Metric label="Auto plan" value={`${recommendation.nextWorkoutsCount} tr.`} />
        <Metric label="Cel czasu" value={`${recommendation.weeklyMinutesTarget} min`} />
      </div>

      <div className={clsx("mt-4 rounded-md border p-3", toneClass)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{recommendation.title}</div>
            <p className="mt-1 text-sm leading-5 text-[#3c4043]">{recommendation.rationale}</p>
          </div>
          <span className="shrink-0 rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-[#3c4043]">
            {recommendation.status}
          </span>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-md bg-white/70 p-2 text-sm text-[#3c4043]">
          {trendIcon}
          <div>
            <div className="font-semibold">{props.insights.raceTrend.label}</div>
            <div className="text-xs leading-5 text-[#5f6368]">
              {props.insights.raceTrend.detail}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-md bg-white/70 p-2 text-sm leading-5 text-[#3c4043]">
          <span className="font-semibold">Fokus: </span>
          {recommendation.planningFocus}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-md border border-[#007f7a] bg-white px-3 py-2 text-sm font-semibold text-[#007f7a]"
            disabled={props.busy}
            type="button"
            onClick={props.onApplyRecommendation}
          >
            <Check size={16} />
            Zastosuj rekomendacje
          </button>
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-md bg-[#007f7a] px-3 py-2 text-sm font-semibold text-white"
            disabled={props.busy}
            type="button"
            onClick={props.onGenerateRecommendation}
          >
            <Wand2 size={16} />
            Generuj automatycznie
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {(Object.keys(goalLabels) as Array<keyof GoalAllocation>).map((key) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs text-[#5f6368]">
              <span>{goalLabels[key]}</span>
              <span>{recommendation.suggestedGoals[key]}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#edf0f2]">
              <div
                className="h-2 rounded-full bg-[#e6634f]"
                style={{ width: `${recommendation.suggestedGoals[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {props.insights.alerts.length > 0 ? (
        <div className="mt-4 space-y-2">
          {props.insights.alerts.slice(0, 4).map((alert) => (
            <div
              className={clsx(
                "rounded-md px-3 py-2 text-xs leading-5",
                alert.level === "danger"
                  ? "bg-[#fff4ef] text-[#9f2f24]"
                  : alert.level === "success"
                    ? "bg-[#eaf7ed] text-[#236b35]"
                    : "bg-[#fff9e6] text-[#705a00]"
              )}
              key={alert.text}
            >
              {alert.text}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {recommendation.actions.slice(0, 3).map((action) => (
          <div
            className="rounded-md border border-[#e2e8eb] bg-[#f8fafb] px-3 py-2 text-xs leading-5 text-[#3c4043]"
            key={action}
          >
            {action}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SummaryPanel(props: {
  goals: GoalAllocation;
  plan: TrainingPlan | null;
  statusCounts: Record<WorkoutStatus, number>;
  workoutsCount: number;
}) {
  const sourceLabel =
    props.plan?.source === "HUGGING_FACE"
      ? "Hugging Face"
      : props.plan?.source === "FALLBACK"
        ? "Fallback regułowy"
        : "Brak planu";

  return (
    <Panel
      title="Podsumowanie tygodnia"
      description="Stan zaplanowanych i zakończonych jednostek."
      icon={Check}
    >
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Źródło" value={sourceLabel} />
        <Metric label="Treningi" value={`${props.plan?.workouts.length ?? 0}/${props.workoutsCount}`} />
      </div>
      <div className="mt-4 space-y-2">
        {(Object.keys(goalLabels) as Array<keyof GoalAllocation>).map((key) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs text-[#5f6368]">
              <span>{goalLabels[key]}</span>
              <span>{props.goals[key]}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#edf0f2]">
              <div
                className="h-2 rounded-full bg-[#007f7a]"
                style={{ width: `${props.goals[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(Object.keys(statusLabels) as WorkoutStatus[]).map((status) => (
          <Metric key={status} label={statusLabels[status]} value={props.statusCounts[status]} />
        ))}
      </div>
      {props.plan?.requests?.[0]?.validationErrors ? (
        <p className="mt-4 rounded-md bg-[#fff7f5] p-3 text-xs leading-5 text-[#c24135]">
          AI odrzucone: {props.plan.requests[0].validationErrors}
        </p>
      ) : null}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-[#f8fafb] p-3">
      <div className="text-xs text-[#5f6368]">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function WorkoutEditor(props: {
  busy: boolean;
  workout: Workout | null;
  onAccept: (id: string) => void;
  onChangeStatus: (id: string, status: WorkoutStatus) => void;
  onExport: (id: string) => void;
  onPatch: (id: string, payload: Partial<Workout>) => Promise<Workout>;
}) {
  const [draft, setDraft] = useState<Workout | null>(props.workout);

  if (!draft) {
    return (
      <Panel
        title="Wybrany trening"
        description="Tutaj pojawią się szczegóły jednostki i kolejne działania."
        icon={ChevronRight}
      >
        <p className="rounded-lg bg-[#f8fafb] p-4 text-sm leading-6 text-[#5f6368]">
          Wygeneruj plan i wybierz trening z kalendarza, aby go edytować lub oznaczyć jako
          wykonany.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Wybrany trening"
      description="Popraw szczegóły, następnie zaakceptuj lub rozlicz jednostkę."
      icon={ChevronRight}
    >
      <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-[#f8fafb] p-3">
        <div>
          <p className="text-sm font-semibold">{draft.title}</p>
          <p className="mt-1 text-xs text-[#5f6368]">
            {normalizeDate(draft.date)} · {draft.durationMin} min · {draft.zoneName}
          </p>
        </div>
        <span
          className={clsx(
            "rounded-md px-2 py-1 text-xs font-semibold",
            draft.status === "DONE" || draft.status === "EXPORTED"
              ? "bg-[#eaf7ed] text-[#2f8d46]"
              : draft.status === "SKIPPED"
                ? "bg-[#fff4ef] text-[#c24135]"
                : "bg-[#edf7f6] text-[#007f7a]"
          )}
        >
          {statusLabels[draft.status]}
        </span>
      </div>
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          Nazwa
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">
            Data
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
              type="date"
              value={normalizeDate(draft.date)}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Minuty
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
              min={10}
              type="number"
              value={draft.durationMin}
              onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">
            Cel
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
              value={draft.goal}
              onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Strefa
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
              value={draft.zoneName}
              onChange={(event) => setDraft({ ...draft, zoneName: event.target.value })}
            />
          </label>
        </div>
        <label className="text-sm font-medium">
          Intensywność
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            value={draft.intensity}
            onChange={(event) => setDraft({ ...draft, intensity: event.target.value })}
          />
        </label>
        <label className="text-sm font-medium">
          Struktura
          <textarea
            className="focus-ring mt-1 min-h-28 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            value={draft.structure}
            onChange={(event) => setDraft({ ...draft, structure: event.target.value })}
          />
        </label>
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#007f7a] bg-white px-4 py-2.5 text-sm font-semibold text-[#007f7a]"
          disabled={props.busy}
          type="button"
          onClick={() => void props.onPatch(draft.id, draft)}
        >
          <Save size={16} />
          Zapisz zmiany
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-3 py-2.5 text-sm font-semibold text-white"
            disabled={props.busy}
            type="button"
            onClick={() => void props.onAccept(draft.id)}
          >
            <Check size={16} />
            Akceptuj
          </button>
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#d9dee3] px-3 py-2.5 text-sm font-semibold"
            disabled={props.busy}
            type="button"
            onClick={() => void props.onExport(draft.id)}
          >
            <Download size={16} />
            Eksport TP
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["DONE", "SKIPPED"] as WorkoutStatus[]).map((status) => (
            <button
              className="focus-ring rounded-lg bg-[#f8fafb] px-3 py-2.5 text-sm font-semibold text-[#3c4043]"
              disabled={props.busy}
              key={status}
              type="button"
              onClick={() => void props.onChangeStatus(draft.id, status)}
            >
              {status === "DONE" ? "Oznacz wykonany" : "Oznacz pominięty"}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
