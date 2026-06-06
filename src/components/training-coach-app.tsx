"use client";

import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Dumbbell,
  Link2,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  UploadCloud,
  UserRound,
  Wand2,
  X
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { clsx } from "clsx";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { addDays, getMondayISO, getWeekDates, parseISODate, toISODate } from "@/lib/dates";

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

type GarminConnectionSummary = {
  connected: boolean;
  mode: string | null;
  providerUserId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  scopes: string[];
  permissions: string[];
  permissionsKnown: boolean;
  missingPermissions: string[];
  canImportActivities: boolean;
  canExportWorkouts: boolean;
};

type GarminActivity = {
  id: string;
  externalId: string;
  startTime: string;
  localDate: string | null;
  sport: string;
  title: string;
  distanceMeters: number | null;
  durationSeconds: number;
  movingDurationSeconds: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgPaceSecondsPerKm: number | null;
  calories: number | null;
  trainingEffect: number | null;
  source: string;
  workoutId: string | null;
  workoutTitle: string | null;
};

type GarminDashboard = {
  connection: GarminConnectionSummary;
  config: {
    oauthReady: boolean;
    activityPullReady: boolean;
    trainingPushReady: boolean;
    webhookSecretReady: boolean;
    tokenEncryptionReady: boolean;
    missing: string[];
    requiredPermissions: string[];
    redirectUri: string;
    webhookUrls: {
      activities: string;
      permissions: string;
      deregistration: string;
    };
  };
  activities: GarminActivity[];
};

type GarminDisconnectResponse = GarminDashboard & {
  disconnect?: {
    remoteRevoked: boolean;
    remoteError: string | null;
  };
};

type WorkoutStatus = "PLANNED" | "ACCEPTED" | "DONE" | "SKIPPED" | "EXPORTED";

type WorkoutSegment = {
  id?: string;
  sortOrder: number;
  label: string;
  durationMin: number;
  zoneName: string;
  paceMinSecPerKm: number;
  paceMaxSecPerKm: number;
  heartRateMinBpm: number;
  heartRateMaxBpm: number;
  intensity: string;
  notes: string | null;
};

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
  segments?: WorkoutSegment[];
};

type TrainingPlan = {
  id: string;
  weekStart: string;
  source: "HUGGING_FACE" | "FALLBACK";
  updatedAt: string;
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

type DrawerView = "profile" | "workout" | "garmin" | null;

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

const defaultGarminDashboard: GarminDashboard = {
  connection: {
    connected: false,
    mode: null,
    providerUserId: null,
    connectedAt: null,
    lastSyncAt: null,
    scopes: [],
    permissions: [],
    permissionsKnown: false,
    missingPermissions: [],
    canImportActivities: false,
    canExportWorkouts: false
  },
  config: {
    oauthReady: false,
    activityPullReady: false,
    trainingPushReady: false,
    webhookSecretReady: false,
    tokenEncryptionReady: false,
    missing: [],
    requiredPermissions: [],
    redirectUri: "/api/garmin/oauth/callback",
    webhookUrls: {
      activities: "/api/garmin/webhooks/activities",
      permissions: "/api/garmin/webhooks/permissions",
      deregistration: "/api/garmin/webhooks/deregistration"
    }
  },
  activities: []
};

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

const statusTone: Record<WorkoutStatus, string> = {
  PLANNED: "bg-[#edf7f6] text-[#007f7a]",
  ACCEPTED: "bg-[#eef4ff] text-[#2f5b9f]",
  DONE: "bg-[#eaf7ed] text-[#2f8d46]",
  SKIPPED: "bg-[#fff4ef] text-[#c24135]",
  EXPORTED: "bg-[#eaf7ed] text-[#2f8d46]"
};

const garminOAuthMessages: Record<string, string> = {
  connected: "Garmin Connect połączony.",
  "oauth-error": "Garmin odrzucił autoryzację.",
  "missing-code": "Garmin nie zwrócił kodu autoryzacji.",
  "invalid-state": "Sesja łączenia Garmin wygasła. Spróbuj ponownie.",
  "token-error": "Nie udało się zakończyć łączenia Garmin."
};

const dayLabels = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
const GARMIN_MAX_IMPORT_RANGE_DAYS = 31;

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

function getISODateRangeDays(startDate: string, endDate: string) {
  try {
    const start = parseISODate(startDate).getTime();
    const end = parseISODate(endDate).getTime();
    return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  } catch {
    return 0;
  }
}

function getGarminImportMaxEndDate(startDate: string) {
  try {
    return toISODate(addDays(parseISODate(startDate), GARMIN_MAX_IMPORT_RANGE_DAYS - 1));
  } catch {
    return "";
  }
}

function readGarminOAuthMessageFromLocation() {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const result = url.searchParams.get("garmin");
  if (!result) return null;

  url.searchParams.delete("garmin");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

  return garminOAuthMessages[result] ?? "Garmin Connect zwrócił nieznany status łączenia.";
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

function formatPaceRange(segment: WorkoutSegment) {
  return `${formatPaceSeconds(segment.paceMinSecPerKm)}-${formatPaceSeconds(
    segment.paceMaxSecPerKm
  )}/km`;
}

function formatHeartRateRange(segment: WorkoutSegment) {
  return `${segment.heartRateMinBpm}-${segment.heartRateMaxBpm} bpm`;
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

function formatDistanceMeters(value: number | null) {
  if (value === null) return "-";
  return `${(value / 1000).toFixed(2)} km`;
}

function formatDurationShort(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatGarminActivityDate(activity: GarminActivity) {
  return activity.localDate ?? normalizeDate(activity.startTime);
}

function formatPlanSource(plan: TrainingPlan | null) {
  if (plan?.source === "HUGGING_FACE") return "Hugging Face";
  if (plan?.source === "FALLBACK") return "Fallback regułowy";
  return "Brak planu";
}

function formatWeekRange(weekDates: string[]) {
  const start = parseISODate(weekDates[0]);
  const end = parseISODate(weekDates[6]);
  const startLabel = new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit"
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(end);

  return `${startLabel} - ${endLabel}`;
}

function formatPlanEditDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
  const [garmin, setGarmin] = useState<GarminDashboard>(defaultGarminDashboard);
  const [raceDistance, setRaceDistance] = useState(10);
  const [raceTime, setRaceTime] = useState("00:45:00");
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [calendarDate, setCalendarDate] = useState(weekStart);
  const [workoutsCount, setWorkoutsCount] = useState(4);
  const [garminImportStart, setGarminImportStart] = useState(weekStart);
  const [garminImportEnd, setGarminImportEnd] = useState(getWeekDates(weekStart)[6]);
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
  const [activeDrawer, setActiveDrawer] = useState<DrawerView>(null);
  const [savedSetup, setSavedSetup] = useState({ profile: false, zones: false });

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const goalSum = Object.values(goals).reduce((sum, value) => sum + value, 0);
  const setupReady = savedSetup.profile && savedSetup.zones;
  const hasPlan = Boolean(plan?.workouts.length);

  function changeCalendarDate(nextCalendarDate: string) {
    const nextWeekStart = getMondayISO(parseISODate(nextCalendarDate));
    const nextWeekDates = getWeekDates(nextWeekStart);
    setCalendarDate(nextCalendarDate);
    setWeekStart(nextWeekStart);
    setGarminImportStart(nextWeekStart);
    setGarminImportEnd(nextWeekDates[6]);
  }

  function changeGarminImportStart(nextStartDate: string) {
    setGarminImportStart(nextStartDate);
    const maxEndDate = getGarminImportMaxEndDate(nextStartDate);
    const nextRangeDays = getISODateRangeDays(nextStartDate, garminImportEnd);
    if (nextRangeDays <= 0) {
      setGarminImportEnd(nextStartDate);
    } else if (maxEndDate && nextRangeDays > GARMIN_MAX_IMPORT_RANGE_DAYS) {
      setGarminImportEnd(maxEndDate);
    }
  }

  function changeGarminImportEnd(nextEndDate: string) {
    const nextRangeDays = getISODateRangeDays(garminImportStart, nextEndDate);
    if (nextRangeDays <= 0) {
      setGarminImportEnd(garminImportStart);
      return;
    }

    const maxEndDate = getGarminImportMaxEndDate(garminImportStart);
    if (maxEndDate && nextRangeDays > GARMIN_MAX_IMPORT_RANGE_DAYS) {
      setGarminImportEnd(maxEndDate);
      return;
    }

    setGarminImportEnd(nextEndDate);
  }

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

  const garminActivitiesByWorkoutId = useMemo(() => {
    const activities = new Map<string, GarminActivity>();
    for (const activity of garmin.activities) {
      if (activity.workoutId) {
        activities.set(activity.workoutId, activity);
      }
    }
    return activities;
  }, [garmin.activities]);

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

  const selectedGarminActivity = selectedWorkout
    ? garminActivitiesByWorkoutId.get(selectedWorkout.id) ?? null
    : null;
  const canSendToGarmin =
    garmin.connection.connected &&
    garmin.connection.canExportWorkouts &&
    (garmin.connection.mode === "mock" || garmin.config.trainingPushReady);

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

  const applyPlanState = useCallback((nextPlan: TrainingPlan | null) => {
    setPlan(nextPlan);
    setSelectedWorkout((current) =>
      current ? (nextPlan?.workouts.find((workout) => workout.id === current.id) ?? null) : null
    );
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    async function loadInitialData() {
      try {
        const [profileResponse, zonesResponse, raceResponse, garminResponse] = await Promise.all([
          apiJson<{ profile: Profile | null }>("/api/profile"),
          apiJson<{ zones: Zone[] }>("/api/zones"),
          apiJson<{ raceResults: RaceResult[] }>("/api/race-results"),
          apiJson<GarminDashboard>("/api/garmin")
        ]);

        setProfile(profileResponse.profile ?? defaultProfile);
        setZones(zonesResponse.zones.length > 0 ? zonesResponse.zones : defaultZones);
        setRaceResults(raceResponse.raceResults);
        setGarmin(garminResponse);
        const setupIsReady = Boolean(profileResponse.profile) && zonesResponse.zones.length > 0;
        setSavedSetup({
          profile: Boolean(profileResponse.profile),
          zones: zonesResponse.zones.length > 0
        });
        if (!setupIsReady) {
          setActiveDrawer("profile");
          setMessage("Uzupełnij profil zawodnika przed generowaniem mikrocyklu.");
        }
        const garminOAuthMessage = readGarminOAuthMessageFromLocation();
        if (garminOAuthMessage) {
          setMessage(garminOAuthMessage);
          setActiveDrawer("garmin");
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
        applyPlanState(response.plan);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nie udało się pobrać planu.");
      }
    }

    void loadPlan();
  }, [applyPlanState, status, weekStart]);

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
        setActiveDrawer("profile");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zalogować.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAthleteProfile() {
    setBusy(true);
    setMessage("");
    try {
      const [profileResponse, zonesResponse] = await Promise.all([
        apiJson<{ profile: Profile }>("/api/profile", {
          method: "PUT",
          body: JSON.stringify(profile)
        }),
        apiJson<{ zones: Zone[] }>("/api/zones", {
          method: "PUT",
          body: JSON.stringify({ zones })
        })
      ]);
      setProfile(profileResponse.profile);
      setZones(zonesResponse.zones);
      setSavedSetup({ profile: true, zones: true });
      setMessage("Profil zawodnika zapisany.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zapisać profilu.");
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

  async function deleteRaceResult(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await apiJson<{ deleted: true }>(`/api/race-results/${id}`, {
        method: "DELETE"
      });
      setRaceResults((current) => current.filter((result) => result.id !== id));
      setMessage("Wynik startowy usunięty.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się usunąć wyniku.");
    } finally {
      setBusy(false);
    }
  }

  function confirmPlanReplacement() {
    if (!hasPlan || typeof window === "undefined") return true;
    return window.confirm(
      "Ten tydzień ma już mikrocykl. Ponowne generowanie zastąpi obecne treningi dla wybranego tygodnia."
    );
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
      if (overrides.workoutsCount !== undefined) {
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
      setSelectedWorkout(null);
      setActiveDrawer(null);
      setMessage(
        successMessage ??
          (response.plan.source === "FALLBACK"
            ? "Mikrocykl wygenerowany fallbackiem regułowym."
            : "Mikrocykl wygenerowany przez Hugging Face.")
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się wygenerować planu.");
    } finally {
      setBusy(false);
    }
  }

  async function generateCurrentPlan() {
    if (!confirmPlanReplacement()) return;
    await generatePlan();
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

  async function saveWorkoutPatch(id: string, payload: Partial<Workout>) {
    setBusy(true);
    setMessage("");
    try {
      const workout = await patchWorkout(id, payload);
      setMessage("Zmiany treningu zapisane.");
      return workout;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zapisać treningu.");
      throw error;
    } finally {
      setBusy(false);
    }
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
      setMessage(
        nextStatus === "DONE"
          ? "Trening oznaczony jako wykonany."
          : nextStatus === "SKIPPED"
            ? "Trening oznaczony jako pominięty."
            : "Status treningu zmieniony."
      );
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

  async function sendWorkoutToGarmin(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{
        export: { reused?: boolean };
        workout: Workout;
      }>(`/api/workouts/${id}/garmin`, {
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
      setMessage(
        response.export.reused
          ? "Ten trening był już w kalendarzu Garmin."
          : "Trening wysłany do kalendarza Garmin."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się wysłać do Garmin.");
    } finally {
      setBusy(false);
    }
  }

  async function sendWeekToGarmin() {
    if (!plan) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<{
        plan: TrainingPlan | null;
        exportedCount: number;
        failedCount: number;
        reusedCount: number;
        skippedCount: number;
      }>("/api/garmin/calendar/export-week", {
        method: "POST",
        body: JSON.stringify({ weekStart })
      });
      applyPlanState(response.plan);
      setMessage(
        response.failedCount > 0
          ? `Garmin: wysłano ${response.exportedCount}, błędy ${response.failedCount}, pominięto ${response.skippedCount}.`
          : `Garmin: nowe ${response.exportedCount}, już były ${response.reusedCount}, pominięto ${response.skippedCount}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się wysłać tygodnia do Garmin.");
    } finally {
      setBusy(false);
    }
  }

  async function connectGarminMock() {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<GarminDashboard>("/api/garmin/connect/mock", {
        method: "POST"
      });
      setGarmin(response);
      setMessage("Garmin mock połączony.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się połączyć Garmin mock.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectGarmin() {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<GarminDisconnectResponse>("/api/garmin", {
        method: "DELETE"
      });
      setGarmin(response);
      setMessage(
        response.disconnect?.remoteError
          ? `Garmin rozłączony lokalnie. Błąd zdalnego odwołania: ${response.disconnect.remoteError}`
          : "Garmin rozłączony."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się rozłączyć Garmin.");
    } finally {
      setBusy(false);
    }
  }

  async function importGarminActivities() {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<GarminDashboard & { importedCount: number }>(
        "/api/garmin/activities/import",
        {
          method: "POST",
          body: JSON.stringify({
            startDate: garminImportStart,
            endDate: garminImportEnd
          })
        }
      );
      setGarmin(response);
      setMessage(`Zaimportowano aktywności Garmin: ${response.importedCount}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się importować aktywności.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshGarminPermissions() {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiJson<GarminDashboard>("/api/garmin/permissions/refresh", {
        method: "POST"
      });
      setGarmin(response);
      setMessage("Zgody Garmin odświeżone.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się odświeżyć zgód Garmin.");
    } finally {
      setBusy(false);
    }
  }

  function openWorkout(workout: Workout) {
    setSelectedWorkout(workout);
    setActiveDrawer("workout");
  }

  if (status === "loading" && session) {
    return <LoadingScreen />;
  }

  if (status !== "authenticated") {
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

  return (
    <div className="min-h-screen bg-[#f4f7f7] text-[#202124]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[252px_minmax(0,1fr)]">
        <WorkspaceSidebar
          garmin={garmin}
          profile={profile}
          setupReady={setupReady}
          userEmail={session.user?.email ?? ""}
          onOpenGarmin={() => setActiveDrawer("garmin")}
          onOpenProfile={() => setActiveDrawer("profile")}
        />

        <main className="thin-scrollbar min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-20 border-b border-[#d9dee3] bg-white/95 px-4 py-4 backdrop-blur lg:px-7">
            <div className="mx-auto max-w-[1720px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      "rounded-md px-2.5 py-1 text-xs font-semibold",
                      hasPlan ? "bg-[#eaf7ed] text-[#2f8d46]" : "bg-[#fff8e8] text-[#7a4d00]"
                    )}
                  >
                    {hasPlan ? "Mikrocykl aktywny" : "Brak mikrocyklu"}
                  </span>
                  <span className="text-xs font-medium text-[#5f6368]">
                    {weekDates[0]} - {weekDates[6]}
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Kalendarz zawodnika</h1>
              </div>
            </div>
          </header>

          {message ? (
            <div className="mx-auto max-w-[1720px] px-4 pt-4 lg:px-7">
              <div
                className="rounded-lg border border-[#b9ddda] bg-[#effbf9] px-4 py-3 text-sm text-[#134b48]"
                role="status"
              >
                {message}
              </div>
            </div>
          ) : null}

          <div className="mx-auto max-w-[1720px] space-y-5 px-4 py-5 lg:px-7">
            <MicrocyclePlanner
              busy={busy}
              goalSum={goalSum}
              goals={goals}
              hasPlan={hasPlan}
              insights={insights}
              plan={plan}
              setupReady={setupReady}
              workoutsCount={workoutsCount}
              setGoals={setGoals}
              setWorkoutsCount={setWorkoutsCount}
              onGenerate={generateCurrentPlan}
            />

            <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_370px]">
              <CalendarPanel
                calendarDate={calendarDate}
                garminActivitiesByWorkoutId={garminActivitiesByWorkoutId}
                groupedWorkouts={groupedWorkouts}
                selectedWorkoutId={selectedWorkout?.id ?? null}
                weekDates={weekDates}
                onCalendarDateChange={changeCalendarDate}
                onMoveWorkout={moveWorkout}
                onSelectWorkout={openWorkout}
              />
              <aside className="space-y-5 2xl:sticky 2xl:top-28">
                <MicrocycleSummary
                  goals={goals}
                  insights={insights}
                  plan={plan}
                  statusCounts={statusCounts}
                  workoutsCount={workoutsCount}
                />
                <GarminCompact
                  garmin={garmin}
                  hasPlan={hasPlan}
                  onOpen={() => setActiveDrawer("garmin")}
                />
              </aside>
            </div>
          </div>
        </main>
      </div>

      <ContextDrawer
        title={
          activeDrawer === "profile"
            ? "Profil zawodnika"
            : activeDrawer === "garmin"
              ? "Garmin Connect"
              : "Szczegóły treningu"
        }
        open={activeDrawer !== null}
        onClose={() => setActiveDrawer(null)}
      >
        {activeDrawer === "profile" ? (
          <ProfileDrawerContent
            busy={busy}
            profile={profile}
            raceDistance={raceDistance}
            raceResults={raceResults}
            raceTime={raceTime}
            zones={zones}
            setProfile={setProfile}
            setRaceDistance={setRaceDistance}
            setRaceTime={setRaceTime}
            setZones={setZones}
            onAddRaceResult={addRaceResult}
            onDeleteRaceResult={deleteRaceResult}
            onSaveProfile={saveAthleteProfile}
          />
        ) : null}
        {activeDrawer === "workout" ? (
          <WorkoutDrawerContent
            key={
              selectedWorkout
                ? `${selectedWorkout.id}-${selectedWorkout.status}-${selectedWorkout.date}-${selectedWorkout.title}-${selectedWorkout.durationMin}`
                : "empty-workout"
            }
            busy={busy}
            canSendToGarmin={canSendToGarmin}
            garminActivity={selectedGarminActivity}
            workout={selectedWorkout}
            weekDates={weekDates}
            onAccept={acceptWorkout}
            onChangeStatus={changeStatus}
            onExport={exportWorkout}
            onMoveWorkout={moveWorkout}
            onPatch={saveWorkoutPatch}
            onSendToGarmin={sendWorkoutToGarmin}
          />
        ) : null}
        {activeDrawer === "garmin" ? (
          <GarminDrawerContent
            busy={busy}
            garmin={garmin}
            hasPlan={hasPlan}
            importEndDate={garminImportEnd}
            importStartDate={garminImportStart}
            onConnectMock={connectGarminMock}
            onDisconnect={disconnectGarmin}
            onExportWeek={sendWeekToGarmin}
            onImportActivities={importGarminActivities}
            onImportEndDateChange={changeGarminImportEnd}
            onImportStartDateChange={changeGarminImportStart}
            onRefreshPermissions={refreshGarminPermissions}
          />
        ) : null}
      </ContextDrawer>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f4f7f7] text-[#202124]">
      <div className="rounded-lg border border-[#d9dee3] bg-white px-5 py-4 text-sm font-medium">
        Ładowanie Training Coach...
      </div>
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
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isRegister = props.authMode === "register";

  return (
    <div className="grid min-h-screen bg-[#f4f7f7] text-[#202124] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex min-h-[42vh] flex-col justify-between bg-[#123130] px-6 py-7 text-white lg:min-h-screen lg:px-10">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#00a19a]">
            <Dumbbell size={19} />
          </span>
          Training Coach
        </div>
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
            Mikrocykl zawodnika w jednym kalendarzu.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#cfe5e2]">
            Profil, tygodniowy plan, realizacja i eksport treningów działają w jednym workspace.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-[#cfe5e2] sm:grid-cols-3">
          <div className="rounded-lg border border-white/15 bg-white/5 p-3">
            <div className="font-semibold text-white">AI + fallback</div>
            <div className="mt-1">Generator utrzymuje tygodniową strukturę planu.</div>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-3">
            <div className="font-semibold text-white">Garmin</div>
            <div className="mt-1">Import realizacji i wysyłka treningów do kalendarza.</div>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-3">
            <div className="font-semibold text-white">Coach</div>
            <div className="mt-1">Wnioski z wykonania i rekomendacje kolejnego tygodnia.</div>
          </div>
        </div>
      </section>

      <main className="flex items-center justify-center px-4 py-10">
        <form
          className="w-full max-w-md rounded-lg border border-[#d9dee3] bg-white p-5 shadow-sm"
          onSubmit={props.onSubmit}
        >
          <div className="mb-5">
            <h2 className="text-2xl font-semibold">{isRegister ? "Nowe konto" : "Logowanie"}</h2>
            <p className="mt-2 text-sm leading-6 text-[#5f6368]">
              {isRegister
                ? "Zmień email, aby utworzyć nowe konto testowe."
                : "Konto demo jest wpisane automatycznie."}
            </p>
          </div>

          <div className="grid gap-4">
            <label className="text-sm font-medium" htmlFor="email">
              Email
              <input
                className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
                id="email"
                type="email"
                value={props.email}
                onChange={(event) => props.setEmail(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium" htmlFor="password">
              Hasło
              <input
                className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
                id="password"
                minLength={8}
                type="password"
                value={props.password}
                onChange={(event) => props.setPassword(event.target.value)}
              />
            </label>
          </div>

          {props.message ? (
            <div className="mt-4 rounded-lg border border-[#f0d6a6] bg-[#fff8e8] p-3 text-sm text-[#7a4d00]">
              {props.message}
            </div>
          ) : null}

          <button
            className="focus-ring mt-5 w-full rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white"
            disabled={props.busy}
            type="submit"
          >
            {isRegister ? "Zarejestruj i zaloguj" : "Zaloguj"}
          </button>

          <button
            className="focus-ring mt-3 w-full rounded-lg border border-[#d9dee3] px-4 py-2.5 text-sm font-semibold text-[#3c4043]"
            type="button"
            onClick={() => props.setAuthMode(isRegister ? "login" : "register")}
          >
            {isRegister ? "Mam już konto" : "Nie mam konta"}
          </button>
        </form>
      </main>
    </div>
  );
}

function WorkspaceSidebar(props: {
  garmin: GarminDashboard;
  profile: Profile;
  setupReady: boolean;
  userEmail: string;
  onOpenGarmin: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <aside className="border-b border-[#d9dee3] bg-white px-4 py-4 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 lg:block">
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

      <div className="mt-5 hidden rounded-lg border border-[#d9dee3] bg-[#f8fafb] p-3 lg:block">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5f6368]">
          Zawodnik
        </div>
        <div className="mt-2 text-sm font-semibold text-[#123130]">
          {props.profile.targetRace || "Cel bez nazwy"}
        </div>
        <div className="mt-1 text-xs text-[#5f6368]">
          {props.profile.weeklyVolumeKm ?? 0} km/tydz. · {props.profile.level}
        </div>
        <button
          className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#007f7a]"
          type="button"
          onClick={props.onOpenProfile}
        >
          <UserRound size={15} />
          Profil zawodnika
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
        <StatusButton
          icon={ShieldCheck}
          label={props.setupReady ? "Profil gotowy" : "Uzupełnij profil"}
          tone={props.setupReady ? "success" : "warning"}
          onClick={props.onOpenProfile}
        />
        <StatusButton
          icon={Activity}
          label={props.garmin.connection.connected ? "Garmin połączony" : "Garmin"}
          tone={props.garmin.connection.connected ? "success" : "neutral"}
          onClick={props.onOpenGarmin}
        />
      </div>

      <div className="mt-6 hidden border-t border-[#d9dee3] pt-5 lg:block">
        <p className="truncate text-sm text-[#5f6368]">{props.userEmail}</p>
        <button
          className="focus-ring mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#3c4043] hover:bg-[#f8fafb]"
          type="button"
          onClick={() => void signOut()}
        >
          <LogOut size={16} />
          Wyloguj
        </button>
      </div>
    </aside>
  );
}

function StatusButton(props: {
  icon: typeof Activity;
  label: string;
  tone: "success" | "warning" | "neutral";
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      className={clsx(
        "focus-ring flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold",
        props.tone === "success" && "border-[#c8e6cf] bg-[#f0faf2] text-[#236b35]",
        props.tone === "warning" && "border-[#f0d6a6] bg-[#fff8e8] text-[#7a4d00]",
        props.tone === "neutral" && "border-[#d9dee3] bg-[#f8fafb] text-[#3c4043]"
      )}
      type="button"
      onClick={props.onClick}
    >
      <Icon size={16} />
      {props.label}
    </button>
  );
}

function MicrocyclePlanner(props: {
  busy: boolean;
  goalSum: number;
  goals: GoalAllocation;
  hasPlan: boolean;
  insights: CoachInsights | null;
  plan: TrainingPlan | null;
  setupReady: boolean;
  workoutsCount: number;
  setGoals: (goals: GoalAllocation) => void;
  setWorkoutsCount: (value: number) => void;
  onGenerate: () => void;
}) {
  const recommendation = props.insights?.recommendation;
  const generationDisabled = props.busy || props.goalSum !== 100 || !props.setupReady;

  return (
    <section className="rounded-lg border border-[#d9dee3] bg-white shadow-sm">
      <div className="border-b border-[#e2e8eb] px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionHeading
            description="Liczba treningów, rozkład bodźców i rekomendacja dla wybranego tygodnia."
            icon={Target}
            title="Mikrocykl tygodniowy"
          />
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#005f5b]"
            disabled={generationDisabled}
            type="button"
            onClick={() => void props.onGenerate()}
          >
            <Wand2 size={16} />
            {props.hasPlan ? "Wygeneruj ponownie" : "Generuj plan"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(260px,0.65fr)_minmax(0,1fr)]">
        <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] xl:block">
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
          <div
            className={clsx(
              "rounded-lg px-3 py-2.5 text-sm xl:mt-3",
              props.goalSum === 100 ? "bg-[#edf7f6] text-[#236b35]" : "bg-[#fff7f5] text-[#c24135]"
            )}
          >
            <div className="font-semibold">
              {props.goalSum === 100 ? "Gotowe do generowania" : "Wymagane 100%"}
            </div>
            <div className="mt-1 text-xs">Suma celów: {props.goalSum}%</div>
          </div>
          {!props.setupReady ? (
            <div className="mt-3 rounded-lg border border-[#f0d6a6] bg-[#fff8e8] p-3 text-xs leading-5 text-[#7a4d00]">
              Najpierw zapisz profil zawodnika i strefy.
            </div>
          ) : null}
          {props.plan?.updatedAt ? (
            <div className="mt-3 rounded-lg bg-[#f8fafb] px-3 py-2.5 text-xs leading-5 text-[#5f6368]">
              Ostatnia edycja mikrocyklu:{" "}
              <span className="font-semibold text-[#3c4043]">
                {formatPlanEditDate(props.plan.updatedAt)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4">
          <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <legend className="sr-only">Rozkład celów w procentach</legend>
            {(Object.keys(goalLabels) as Array<keyof GoalAllocation>).map((key) => (
              <label className="block rounded-lg border border-[#e2e8eb] bg-[#f8fafb] p-2.5" key={key}>
                <span className="text-xs font-semibold text-[#5f6368]">{goalLabels[key]}</span>
                <input
                  className="focus-ring mt-2 w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
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
                <div className="mt-2 h-1.5 rounded-full bg-[#e2e8eb]">
                  <div
                    className="h-1.5 rounded-full bg-[#007f7a]"
                    style={{ width: `${props.goals[key]}%` }}
                  />
                </div>
              </label>
            ))}
          </fieldset>

          {recommendation ? (
            <div className="rounded-lg border border-[#b9ddda] bg-[#effbf9] p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#123130]">
                    <Bot size={16} />
                    {recommendation.title}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#315955]">
                    {recommendation.planningFocus}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Auto plan" value={`${recommendation.nextWorkoutsCount} tr.`} />
                  <Metric label="Cel czasu" value={`${recommendation.weeklyMinutesTarget} min`} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CalendarPanel(props: {
  calendarDate: string;
  garminActivitiesByWorkoutId: Map<string, GarminActivity>;
  groupedWorkouts: Map<string, Workout[]>;
  selectedWorkoutId: string | null;
  weekDates: string[];
  onCalendarDateChange: (date: string) => void;
  onMoveWorkout: (workoutId: string, date: string) => void;
  onSelectWorkout: (workout: Workout) => void;
}) {
  function shiftWeek(days: number) {
    props.onCalendarDateChange(toISODate(addDays(parseISODate(props.calendarDate), days)));
  }

  return (
    <section className="rounded-lg border border-[#d9dee3] bg-white shadow-sm">
      <div className="border-b border-[#e2e8eb] px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionHeading
            description="Kliknij jednostkę, żeby otworzyć szczegóły po prawej stronie."
            icon={CalendarDays}
            title="Kalendarz tygodnia"
          />
          <div className="flex w-full max-w-full items-stretch overflow-hidden rounded-lg border border-[#d9dee3] bg-white sm:w-auto">
            <button
              aria-label="Poprzedni tydzień"
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center border-r border-[#d9dee3] text-[#3c4043] hover:bg-[#edf7f6] hover:text-[#007f7a]"
              data-testid="previous-week"
              type="button"
              onClick={() => shiftWeek(-7)}
            >
              <ChevronLeft size={17} />
            </button>
            <label className="sr-only" htmlFor="week-start">
              Wybierz datę, aby przejść do tygodnia
            </label>
            <div
              className="relative h-10 min-w-0 flex-1 focus-within:ring-2 focus-within:ring-[#007f7a]/20 sm:w-[220px]"
              data-testid="week-range-picker"
            >
              <input
                aria-label={`Wybierz datę w tygodniu ${formatWeekRange(props.weekDates)}`}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                id="week-start"
                type="date"
                value={props.calendarDate}
                onChange={(event) => props.onCalendarDateChange(event.target.value)}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none flex h-full items-center justify-center gap-2 px-3 text-sm font-semibold text-[#202124]"
              >
                <CalendarDays className="shrink-0 text-[#007f7a]" size={15} />
                <span className="truncate">{formatWeekRange(props.weekDates)}</span>
              </div>
            </div>
            <button
              aria-label="Następny tydzień"
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center border-l border-[#d9dee3] text-[#3c4043] hover:bg-[#edf7f6] hover:text-[#007f7a]"
              data-testid="next-week"
              type="button"
              onClick={() => shiftWeek(7)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {props.weekDates.map((date, index) => {
          const dayWorkouts = props.groupedWorkouts.get(date) ?? [];

          return (
            <div
              className="min-h-[210px] rounded-lg border border-[#e2e8eb] bg-[#f8fafb] p-2.5 xl:min-h-[430px]"
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
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#5f6368]">
                    {dayLabels[index]}
                  </div>
                  <div className="text-sm font-semibold">{date.slice(5)}</div>
                </div>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#7b8286]">
                  {dayWorkouts.length || "off"}
                </span>
              </div>

              <div className="space-y-2">
                {dayWorkouts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#d9dee3] bg-white/70 px-3 py-5 text-center text-xs font-medium text-[#7b8286]">
                    Odpoczynek
                  </div>
                ) : null}
                {dayWorkouts.map((workout) => {
                  const activity = props.garminActivitiesByWorkoutId.get(workout.id) ?? null;
                  const firstSegment = workout.segments?.[0] ?? null;

                  return (
                    <button
                      className={clsx(
                        "focus-ring w-full rounded-lg border bg-white p-3 text-left text-sm transition hover:border-[#007f7a] hover:shadow-sm",
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
                      <div className="mb-2 flex min-h-5 items-start">
                        <span
                          className={clsx(
                            "inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight break-words",
                            statusTone[workout.status]
                          )}
                          title={statusLabels[workout.status]}
                        >
                          {statusLabels[workout.status]}
                        </span>
                      </div>
                      <div className="min-w-0 break-words font-semibold leading-5 text-[#202124]">
                        {workout.title}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#5f6368]">
                        <span>{workout.durationMin} min</span>
                        <span>·</span>
                        <span>{workout.goal}</span>
                        <span>·</span>
                        <span>{workout.zoneName}</span>
                      </div>
                      {firstSegment ? (
                        <div className="mt-2 rounded-md bg-[#f8fafb] px-2 py-1.5 text-xs leading-5 text-[#3c4043]">
                          {formatPaceRange(firstSegment)} · {formatHeartRateRange(firstSegment)}
                        </div>
                      ) : null}
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#3c4043]">
                        {workout.structure}
                      </p>
                      <WorkoutRealization workout={workout} activity={activity} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WorkoutRealization(props: { workout: Workout; activity: GarminActivity | null }) {
  if (props.activity) {
    return (
      <div className="mt-2 rounded-md border border-[#b9ddda] bg-[#effbf9] px-2 py-1.5 text-xs text-[#315955]">
        Garmin: {formatDistanceMeters(props.activity.distanceMeters)} ·{" "}
        {formatDurationShort(props.activity.durationSeconds)}
      </div>
    );
  }

  if (props.workout.status === "DONE" || props.workout.status === "EXPORTED") {
    return (
      <div className="mt-2 rounded-md bg-[#eaf7ed] px-2 py-1.5 text-xs font-semibold text-[#236b35]">
        Realizacja: wykonane
      </div>
    );
  }

  if (props.workout.status === "SKIPPED") {
    return (
      <div className="mt-2 rounded-md bg-[#fff4ef] px-2 py-1.5 text-xs font-semibold text-[#9f2f24]">
        Realizacja: pominięte
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md bg-[#f8fafb] px-2 py-1.5 text-xs font-medium text-[#7b8286]">
      Realizacja: oczekuje
    </div>
  );
}

function MicrocycleSummary(props: {
  goals: GoalAllocation;
  insights: CoachInsights | null;
  plan: TrainingPlan | null;
  statusCounts: Record<WorkoutStatus, number>;
  workoutsCount: number;
}) {
  const currentWeek = props.insights?.currentWeek;
  const recommendation = props.insights?.recommendation;

  return (
    <section className="rounded-lg border border-[#d9dee3] bg-white shadow-sm">
      <div className="border-b border-[#e2e8eb] px-4 py-4">
        <SectionHeading
          description="Założenia, wykonanie i wnioski dla wybranego tygodnia."
          icon={BarChart3}
          title="Podsumowanie mikrocyklu"
        />
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Źródło" value={formatPlanSource(props.plan)} />
          <Metric
            label="Treningi"
            value={`${props.plan?.workouts.length ?? 0}/${props.workoutsCount}`}
          />
          <Metric
            label="Wykonanie"
            value={currentWeek ? `${currentWeek.completionRate}%` : "brak"}
          />
          <Metric
            label="Minuty"
            value={
              currentWeek
                ? `${currentWeek.completedMinutes}/${currentWeek.plannedMinutes}`
                : "0/0"
            }
          />
        </div>

        <div className="space-y-2">
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

        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(statusLabels) as WorkoutStatus[]).map((workoutStatus) => (
            <Metric
              key={workoutStatus}
              label={statusLabels[workoutStatus]}
              value={props.statusCounts[workoutStatus]}
            />
          ))}
        </div>

        {recommendation ? (
          <div className="rounded-lg border border-[#b9ddda] bg-[#effbf9] p-3 text-sm">
            <div className="font-semibold text-[#123130]">{recommendation.title}</div>
            <p className="mt-1 leading-5 text-[#315955]">{recommendation.rationale}</p>
          </div>
        ) : null}

        {props.insights?.alerts.length ? (
          <div className="space-y-2">
            {props.insights.alerts.slice(0, 3).map((alert) => (
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

        {props.plan?.requests?.[0]?.validationErrors ? (
          <p className="rounded-md bg-[#fff7f5] p-3 text-xs leading-5 text-[#c24135]">
            AI odrzucone: {props.plan.requests[0].validationErrors}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function GarminCompact(props: {
  garmin: GarminDashboard;
  hasPlan: boolean;
  onOpen: () => void;
}) {
  const connected = props.garmin.connection.connected;

  return (
    <section className="rounded-lg border border-[#d9dee3] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading
          description={`${props.garmin.activities.length} aktywności · ${
            props.hasPlan ? "plan gotowy" : "brak planu"
          }`}
          icon={Activity}
          title="Garmin"
        />
        <span
          className={clsx(
            "rounded-md px-2 py-1 text-xs font-semibold",
            connected ? "bg-[#eaf7ed] text-[#236b35]" : "bg-[#f8fafb] text-[#5f6368]"
          )}
        >
          {connected ? props.garmin.connection.mode ?? "OAuth" : "Brak"}
        </span>
      </div>
      <button
        className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#007f7a] bg-white px-3 py-2.5 text-sm font-semibold text-[#007f7a]"
        type="button"
        onClick={props.onOpen}
      >
        <Activity size={16} />
        Otwórz integrację
      </button>
    </section>
  );
}

function ContextDrawer(props: {
  children: React.ReactNode;
  open: boolean;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!props.open) return;

    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBody = {
      left: bodyStyle.left,
      overflow: bodyStyle.overflow,
      paddingRight: bodyStyle.paddingRight,
      position: bodyStyle.position,
      right: bodyStyle.right,
      top: bodyStyle.top,
      width: bodyStyle.width
    };
    const previousHtmlOverflow = htmlStyle.overflow;

    htmlStyle.overflow = "hidden";
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    if (scrollbarWidth > 0) {
      bodyStyle.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      htmlStyle.overflow = previousHtmlOverflow;
      bodyStyle.position = previousBody.position;
      bodyStyle.top = previousBody.top;
      bodyStyle.left = previousBody.left;
      bodyStyle.right = previousBody.right;
      bodyStyle.width = previousBody.width;
      bodyStyle.overflow = previousBody.overflow;
      bodyStyle.paddingRight = previousBody.paddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Zamknij panel"
        className="absolute inset-0 bg-[#123130]/20"
        type="button"
        onClick={props.onClose}
      />
      <aside className="thin-scrollbar absolute inset-y-0 right-0 w-full max-w-[560px] overflow-y-auto border-l border-[#d9dee3] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#e2e8eb] bg-white/95 px-4 py-4 backdrop-blur">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <button
            aria-label="Zamknij panel"
            className="focus-ring rounded-lg border border-[#d9dee3] p-2 text-[#5f6368] hover:text-[#202124]"
            type="button"
            onClick={props.onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{props.children}</div>
      </aside>
    </div>
  );
}

function ProfileDrawerContent(props: {
  busy: boolean;
  profile: Profile;
  raceDistance: number;
  raceResults: RaceResult[];
  raceTime: string;
  zones: Zone[];
  setProfile: (profile: Profile) => void;
  setRaceDistance: (value: number) => void;
  setRaceTime: (value: string) => void;
  setZones: (zones: Zone[]) => void;
  onAddRaceResult: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteRaceResult: (id: string) => void;
  onSaveProfile: () => void;
}) {
  function updateZone(index: number, patch: Partial<Zone>) {
    props.setZones(
      props.zones.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, ...patch } : zone))
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[#e2e8eb] bg-[#f8fafb] p-3">
        <SectionHeading
          description="Dane używane przez generator i rekomendacje coacha."
          icon={UserRound}
          title="Dane zawodnika"
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="level">
            Poziom
            <select
              className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] bg-white px-3 py-2.5 text-sm"
              id="level"
              value={props.profile.level}
              onChange={(event) =>
                props.setProfile({
                  ...props.profile,
                  level: event.target.value as Profile["level"]
                })
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
              className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] bg-white px-3 py-2.5 text-sm"
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
              className="focus-ring mt-2 w-full rounded-lg border border-[#c7cdd2] bg-white px-3 py-2.5 text-sm"
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
              className="focus-ring mt-2 min-h-20 w-full rounded-lg border border-[#c7cdd2] bg-white px-3 py-2.5 text-sm"
              id="notes"
              value={props.profile.notes ?? ""}
              onChange={(event) => props.setProfile({ ...props.profile, notes: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[#e2e8eb] bg-white p-3">
        <SectionHeading
          description="Progi tempa i tętna używane w strukturze treningów."
          icon={SlidersHorizontal}
          title="Strefy intensywności"
        />
        <div className="mt-4 grid gap-5">
          {(["PACE", "HEART_RATE"] as const).map((type) => (
            <fieldset className="rounded-lg border border-[#e2e8eb] p-3" key={type}>
              <legend className="px-2 text-sm font-semibold">
                {type === "PACE" ? "Tempo" : "Tętno"}
                <span className="ml-1 text-xs font-normal text-[#5f6368]">
                  ({type === "PACE" ? "min/km" : "bpm"})
                </span>
              </legend>
              <div className="mb-2 grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-1 text-xs text-[#5f6368] sm:grid-cols-[52px_minmax(96px,1fr)_minmax(96px,1fr)_64px]">
                <span>Strefa</span>
                <span>Od</span>
                <span>Do</span>
                <span className="hidden sm:block">Jedn.</span>
              </div>
              <div className="space-y-2">
                {props.zones.map((zone, index) =>
                  zone.type !== type ? null : (
                    <div
                      className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-sm sm:grid-cols-[52px_minmax(96px,1fr)_minmax(96px,1fr)_64px]"
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
                          className="focus-ring min-w-0 rounded-lg border border-[#c7cdd2] px-2 py-2 text-right tabular-nums"
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
                          className="focus-ring min-w-0 rounded-lg border border-[#c7cdd2] px-2 py-2 text-right tabular-nums"
                          step="1"
                          type="number"
                          value={zone.maxValue}
                          onChange={(event) =>
                            updateZone(index, { maxValue: Number(event.target.value) })
                          }
                        />
                      )}
                      <span className="hidden rounded-lg bg-[#f8fafb] px-2 py-2.5 text-xs text-[#5f6368] sm:block">
                        {zone.unit}
                      </span>
                    </div>
                  )
                )}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <button
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-4 py-3 text-sm font-semibold text-white"
        disabled={props.busy}
        type="button"
        onClick={props.onSaveProfile}
      >
        <Save size={16} />
        Zapisz profil
      </button>

      <form className="rounded-lg border border-[#e2e8eb] bg-white p-3" onSubmit={props.onAddRaceResult}>
        <SectionHeading
          description="Pomaga oceniać postęp lub regres w rekomendacjach."
          icon={TrendingUp}
          title="Wyniki odniesienia"
        />
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
          {props.raceResults.slice(0, 6).map((result) => (
            <div
              className="flex items-center justify-between rounded-lg bg-[#f8fafb] px-3 py-2.5 text-sm"
              key={result.id}
            >
              <span>{result.distanceKm} km</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs">{secondsToTime(result.resultSeconds)}</span>
                <button
                  aria-label={`Usuń wynik ${result.distanceKm} km`}
                  className="focus-ring rounded-md p-1.5 text-[#8a1f11] transition hover:bg-[#fce8e6] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={props.busy}
                  title="Usuń wynik"
                  type="button"
                  onClick={() => props.onDeleteRaceResult(result.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}

function PaceInput(props: {
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? formatPaceSeconds(props.value);

  function commit() {
    const seconds = parsePaceSeconds(displayValue);
    if (seconds !== null) {
      props.onChange(seconds);
      setDraft(null);
    } else {
      setDraft(null);
    }
  }

  return (
    <input
      aria-label={props.ariaLabel}
      className="focus-ring min-w-0 rounded-lg border border-[#c7cdd2] px-2 py-2 text-right tabular-nums"
      inputMode="numeric"
      value={displayValue}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function WorkoutDrawerContent(props: {
  busy: boolean;
  canSendToGarmin: boolean;
  garminActivity: GarminActivity | null;
  workout: Workout | null;
  weekDates: string[];
  onAccept: (id: string) => void;
  onChangeStatus: (id: string, status: WorkoutStatus) => void;
  onExport: (id: string) => void;
  onMoveWorkout: (workoutId: string, date: string) => void;
  onPatch: (id: string, payload: Partial<Workout>) => Promise<Workout>;
  onSendToGarmin: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Workout | null>(props.workout);

  const garminExportDisabledReason = !draft
    ? null
    : props.busy
      ? "Poczekaj na zakończenie bieżącej operacji."
      : !props.canSendToGarmin
        ? "Połącz Garmin i upewnij się, że eksport treningów jest dostępny."
        : draft.status === "DONE" || draft.status === "SKIPPED"
          ? "Garmin przyjmuje tylko treningi zaplanowane lub zaakceptowane."
          : null;
  const garminExportDisabled = Boolean(garminExportDisabledReason);

  if (!draft) {
    return (
      <div className="rounded-lg bg-[#f8fafb] p-4 text-sm leading-6 text-[#5f6368]">
        Wybierz trening z kalendarza, aby edytować szczegóły albo rozliczyć wykonanie.
      </div>
    );
  }

  const segments = draft.segments ?? [];
  const selectedWorkoutDate = normalizeDate(draft.date);
  const updateDraftSegment = (index: number, patch: Partial<WorkoutSegment>) => {
    setDraft({
      ...draft,
      segments: segments.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, ...patch } : segment
      )
    });
  };
  const moveSelectedWorkout = (nextDate: string) => {
    setDraft({ ...draft, date: nextDate });
    props.onMoveWorkout(draft.id, nextDate);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[#e2e8eb] bg-[#f8fafb] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">{draft.title}</p>
            <p className="mt-1 text-xs text-[#5f6368]">
              {normalizeDate(draft.date)} · {draft.durationMin} min · {draft.zoneName}
            </p>
          </div>
          <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", statusTone[draft.status])}>
            {statusLabels[draft.status]}
          </span>
        </div>
        {props.garminActivity ? (
          <div className="mt-3 rounded-lg border border-[#b9ddda] bg-[#effbf9] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[#123130]">Garmin wykonanie</div>
                <div className="mt-1 text-xs text-[#456461]">
                  {formatGarminActivityDate(props.garminActivity)} · {props.garminActivity.title}
                </div>
              </div>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#007f7a]">
                {formatDistanceMeters(props.garminActivity.distanceMeters)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric label="Czas" value={formatDurationShort(props.garminActivity.durationSeconds)} />
              <Metric
                label="Tempo"
                value={
                  props.garminActivity.avgPaceSecondsPerKm
                    ? `${formatPaceSeconds(props.garminActivity.avgPaceSecondsPerKm)}/km`
                    : "-"
                }
              />
              <Metric label="HR" value={props.garminActivity.avgHeartRate ?? "-"} />
            </div>
          </div>
        ) : null}
      </div>

      <section className="rounded-lg border border-[#e2e8eb] bg-white p-3">
        <SectionHeading
          description="Zmiany zapisują się w aktualnym mikrocyklu tygodniowym."
          icon={Save}
          title="Edycja treningu"
        />
        <div className="mt-4 grid gap-3">
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
          <label className="text-sm font-medium">
            Przenieś na dzień
            <select
              className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
              disabled={props.busy}
              value={selectedWorkoutDate}
              onChange={(event) => moveSelectedWorkout(event.currentTarget.value)}
            >
              {props.weekDates.map((date, index) => (
                <option key={date} value={date}>
                  {dayLabels[index]} {date.slice(5)}
                </option>
              ))}
            </select>
          </label>
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
        </div>
      </section>

      <section className="rounded-lg border border-[#e2e8eb] bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            description="Źródło prawdy dla zakresów min/km i bpm."
            icon={Activity}
            title="Segmenty"
          />
          <span className="rounded-md bg-[#f8fafb] px-2 py-1 text-xs font-semibold text-[#007f7a]">
            {segments.reduce((sum, segment) => sum + segment.durationMin, 0)} min
          </span>
        </div>
        {segments.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-[#c7cdd2] bg-[#f8fafb] p-3 text-sm text-[#5f6368]">
            Ten trening nie ma jeszcze segmentów. Eksporty użyją opisu tekstowego.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {segments.map((segment, index) => (
              <div
                className="grid gap-2 rounded-lg border border-[#e2e8eb] bg-[#f8fafb] p-3 sm:grid-cols-2"
                key={segment.id ?? `${segment.label}-${index}`}
              >
                <label className="text-xs font-medium text-[#5f6368] sm:col-span-2">
                  Segment
                  <input
                    className="focus-ring mt-1 w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
                    value={segment.label}
                    onChange={(event) => updateDraftSegment(index, { label: event.target.value })}
                  />
                </label>
                <label className="text-xs font-medium text-[#5f6368]">
                  Min
                  <input
                    className="focus-ring mt-1 w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
                    min={1}
                    type="number"
                    value={segment.durationMin}
                    onChange={(event) =>
                      updateDraftSegment(index, { durationMin: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="text-xs font-medium text-[#5f6368]">
                  Strefa
                  <input
                    className="focus-ring mt-1 w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
                    value={segment.zoneName}
                    onChange={(event) => updateDraftSegment(index, { zoneName: event.target.value })}
                  />
                </label>
                <label className="text-xs font-medium text-[#5f6368]">
                  Tempo min/max
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <PaceInput
                      ariaLabel={`Tempo minimalne segmentu ${index + 1}`}
                      value={segment.paceMinSecPerKm}
                      onChange={(value) => updateDraftSegment(index, { paceMinSecPerKm: value })}
                    />
                    <PaceInput
                      ariaLabel={`Tempo maksymalne segmentu ${index + 1}`}
                      value={segment.paceMaxSecPerKm}
                      onChange={(value) => updateDraftSegment(index, { paceMaxSecPerKm: value })}
                    />
                  </div>
                  <span className="mt-1 block text-[11px]">{formatPaceRange(segment)}</span>
                </label>
                <label className="text-xs font-medium text-[#5f6368]">
                  HR min/max
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <input
                      className="focus-ring w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
                      min={1}
                      type="number"
                      value={segment.heartRateMinBpm}
                      onChange={(event) =>
                        updateDraftSegment(index, {
                          heartRateMinBpm: Number(event.target.value)
                        })
                      }
                    />
                    <input
                      className="focus-ring w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
                      min={1}
                      type="number"
                      value={segment.heartRateMaxBpm}
                      onChange={(event) =>
                        updateDraftSegment(index, {
                          heartRateMaxBpm: Number(event.target.value)
                        })
                      }
                    />
                  </div>
                  <span className="mt-1 block text-[11px]">{formatHeartRateRange(segment)}</span>
                </label>
                <label className="text-xs font-medium text-[#5f6368] sm:col-span-2">
                  Intensywność
                  <input
                    className="focus-ring mt-1 w-full rounded-md border border-[#c7cdd2] bg-white px-2 py-2 text-sm text-[#202124]"
                    value={segment.intensity}
                    onChange={(event) => updateDraftSegment(index, { intensity: event.target.value })}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-2">
        <button
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-[#007f7a] bg-white px-4 py-2.5 text-sm font-semibold text-[#007f7a]"
          disabled={props.busy}
          type="button"
          onClick={() => void props.onPatch(draft.id, draft)}
        >
          <Save size={16} />
          Zapisz zmiany
        </button>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-3 py-2.5 text-sm font-semibold text-white"
            disabled={props.busy}
            type="button"
            onClick={() => void props.onAccept(draft.id)}
          >
            <Check size={16} />
            Akceptuj
          </button>
          {(["DONE", "SKIPPED"] as WorkoutStatus[]).map((workoutStatus) => (
            <button
              className="focus-ring rounded-lg bg-[#f8fafb] px-3 py-2.5 text-sm font-semibold text-[#3c4043]"
              disabled={props.busy}
              key={workoutStatus}
              type="button"
              onClick={() => void props.onChangeStatus(draft.id, workoutStatus)}
            >
              {workoutStatus === "DONE" ? "Oznacz wykonany" : "Oznacz pominięty"}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#d9dee3] px-3 py-2.5 text-sm font-semibold"
            disabled={props.busy}
            type="button"
            onClick={() => void props.onExport(draft.id)}
          >
            <Download size={16} />
            TrainingPeaks
          </button>
          <button
            aria-describedby={garminExportDisabledReason ? "garmin-workout-disabled" : undefined}
            className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#d9dee3] px-3 py-2.5 text-sm font-semibold"
            disabled={garminExportDisabled}
            type="button"
            onClick={() => void props.onSendToGarmin(draft.id)}
          >
            <UploadCloud size={16} />
            Garmin
          </button>
        </div>
        {garminExportDisabledReason ? (
          <p id="garmin-workout-disabled" className="text-xs leading-5 text-[#5f6368]">
            Garmin: {garminExportDisabledReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GarminDrawerContent(props: {
  busy: boolean;
  garmin: GarminDashboard;
  hasPlan: boolean;
  importEndDate: string;
  importStartDate: string;
  onConnectMock: () => void;
  onDisconnect: () => void;
  onExportWeek: () => void;
  onImportEndDateChange: (value: string) => void;
  onImportActivities: () => void;
  onImportStartDateChange: (value: string) => void;
  onRefreshPermissions: () => void;
}) {
  const connected = props.garmin.connection.connected;
  const isMock = props.garmin.connection.mode === "mock";
  const importRangeDays = getISODateRangeDays(props.importStartDate, props.importEndDate);
  const importRangeInvalid =
    importRangeDays <= 0 || importRangeDays > GARMIN_MAX_IMPORT_RANGE_DAYS;
  const importMaxEndDate = getGarminImportMaxEndDate(props.importStartDate);
  const permissionsLabel = !connected
    ? "-"
    : props.garmin.connection.permissionsKnown
      ? props.garmin.connection.missingPermissions.length === 0
        ? "OK"
        : "Brak"
      : "Nieznane";
  const configLabel = props.garmin.config.missing.length === 0 ? "OK" : "Brak";
  const lastSync = props.garmin.connection.lastSyncAt
    ? normalizeDate(props.garmin.connection.lastSyncAt)
    : "-";
  const oauthDisabledReason = props.garmin.config.oauthReady
    ? null
    : "OAuth wymaga konfiguracji Garmin w środowisku.";
  const importDisabledReason = props.busy
    ? "Poczekaj na zakończenie bieżącej operacji."
    : !connected
      ? "Połącz Garmin, aby importować aktywności."
      : !props.garmin.connection.canImportActivities
        ? "Brakuje zgody na import aktywności."
        : !(isMock || props.garmin.config.activityPullReady)
          ? "Import produkcyjny wymaga konfiguracji endpointu."
          : importRangeInvalid
            ? `Zakres importu musi mieć od 1 do ${GARMIN_MAX_IMPORT_RANGE_DAYS} dni.`
            : null;
  const exportWeekDisabledReason = props.busy
    ? "Poczekaj na zakończenie bieżącej operacji."
    : !props.hasPlan
      ? "Najpierw wygeneruj plan tygodnia."
      : !connected
        ? "Połącz Garmin, aby wysłać tydzień."
        : !props.garmin.connection.canExportWorkouts
          ? "Brakuje zgody na wysyłkę treningów."
          : !(isMock || props.garmin.config.trainingPushReady)
            ? "Eksport produkcyjny wymaga konfiguracji endpointu."
            : null;
  const garminActionNotes = [
    oauthDisabledReason ? `OAuth Garmin: ${oauthDisabledReason}` : null,
    importDisabledReason ? `Import: ${importDisabledReason}` : null,
    exportWeekDisabledReason ? `Wysyłka tygodnia: ${exportWeekDisabledReason}` : null
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Status" value={connected ? props.garmin.connection.mode ?? "OAuth" : "Brak"} />
        <Metric label="Zgody" value={permissionsLabel} />
        <Metric label="Konfig" value={configLabel} />
        <Metric label="Ostatni sync" value={lastSync} />
      </div>

      {connected && props.garmin.connection.permissionsKnown && props.garmin.connection.missingPermissions.length > 0 ? (
        <div className="rounded-lg border border-[#f0d6a6] bg-[#fff8e8] p-3 text-sm text-[#7a4d00]">
          Brak zgód Garmin: {props.garmin.connection.missingPermissions.join(", ")}.
        </div>
      ) : null}
      {connected && !props.garmin.connection.permissionsKnown ? (
        <div className="rounded-lg border border-[#d9dee3] bg-[#f8fafb] p-3 text-sm text-[#5f6368]">
          Nie potwierdzono jeszcze zgód Garmin dla tego połączenia.
        </div>
      ) : null}
      {connected && isMock ? (
        <div className="rounded-lg border border-[#b9ddda] bg-[#effbf9] p-3 text-sm text-[#315955]">
          Garmin działa w trybie mock. Import i wysyłka są dostępne testowo dla tego konta.
        </div>
      ) : null}

      <details className="rounded-lg border border-[#d9dee3] bg-[#f8fafb] p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-[#123130]">
          Konfiguracja techniczna
        </summary>
        {props.garmin.config.missing.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[#f0d6a6] bg-[#fff8e8] p-3 text-sm text-[#7a4d00]">
            Brak konfiguracji produkcyjnej: {props.garmin.config.missing.join(", ")}.
          </div>
        ) : null}
        <div className="mt-3 grid gap-2">
          <TechnicalField label="Redirect URI" value={props.garmin.config.redirectUri} />
          <TechnicalField
            label="Zgody API"
            value={props.garmin.config.requiredPermissions.join(" ") || "-"}
          />
          <TechnicalField label="Activities webhook" value={props.garmin.config.webhookUrls.activities} />
          <TechnicalField label="Permissions webhook" value={props.garmin.config.webhookUrls.permissions} />
          <TechnicalField
            label="Deregistration webhook"
            value={props.garmin.config.webhookUrls.deregistration}
          />
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Import od
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            type="date"
            value={props.importStartDate}
            max={props.importEndDate}
            onChange={(event) => props.onImportStartDateChange(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Import do
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-[#c7cdd2] px-3 py-2.5 text-sm"
            type="date"
            value={props.importEndDate}
            min={props.importStartDate}
            max={importMaxEndDate}
            onChange={(event) => props.onImportEndDateChange(event.target.value)}
          />
        </label>
      </div>
      {importRangeInvalid ? (
        <div className="rounded-lg border border-[#f0d6a6] bg-[#fff8e8] p-3 text-sm text-[#7a4d00]">
          Zakres importu Garmin musi mieć od 1 do {GARMIN_MAX_IMPORT_RANGE_DAYS} dni.
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#007f7a] bg-white px-4 py-2.5 text-sm font-semibold text-[#007f7a]"
          disabled={props.busy}
          type="button"
          onClick={props.onConnectMock}
        >
          <Link2 size={16} />
          Połącz mock
        </button>
        <a
          aria-disabled={Boolean(oauthDisabledReason)}
          className={clsx(
            "focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#d9dee3] px-4 py-2.5 text-sm font-semibold",
            !oauthDisabledReason ? "text-[#3c4043]" : "pointer-events-none text-[#9aa0a6]"
          )}
          href={!oauthDisabledReason ? "/api/garmin/oauth/start" : undefined}
        >
          <Link2 size={16} />
          OAuth Garmin
        </a>
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#007f7a] px-4 py-2.5 text-sm font-semibold text-white"
          disabled={Boolean(importDisabledReason)}
          type="button"
          onClick={props.onImportActivities}
        >
          <RefreshCw size={16} />
          Importuj tydzień
        </button>
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#d9dee3] px-4 py-2.5 text-sm font-semibold text-[#3c4043]"
          disabled={props.busy || !connected}
          type="button"
          onClick={props.onRefreshPermissions}
        >
          <ShieldCheck size={16} />
          Zgody
        </button>
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg bg-[#123130] px-4 py-2.5 text-sm font-semibold text-white"
          disabled={Boolean(exportWeekDisabledReason)}
          type="button"
          onClick={props.onExportWeek}
        >
          <UploadCloud size={16} />
          Wyślij tydzień
        </button>
        <button
          className="focus-ring flex items-center justify-center gap-2 rounded-lg border border-[#d9dee3] bg-white px-4 py-2.5 text-sm font-semibold text-[#3c4043]"
          disabled={props.busy || !connected}
          type="button"
          onClick={props.onDisconnect}
        >
          <LogOut size={16} />
          Rozłącz
        </button>
      </div>
      {garminActionNotes.length > 0 ? (
        <div className="rounded-lg bg-[#f8fafb] p-3 text-xs leading-5 text-[#5f6368]">
          <div className="font-semibold text-[#3c4043]">Dlaczego część akcji jest niedostępna?</div>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {garminActionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="rounded-lg border border-[#e2e8eb] bg-white p-3">
        <SectionHeading
          description={`${props.garmin.activities.length} zaimportowanych aktywności`}
          icon={Activity}
          title="Aktywności Garmin"
        />
        <div className="mt-3 space-y-2">
          {props.garmin.activities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d9dee3] bg-[#f8fafb] p-4 text-sm text-[#5f6368]">
              Brak zaimportowanych aktywności Garmin dla tego zawodnika.
            </div>
          ) : null}
          {props.garmin.activities.map((activity) => (
            <div className="rounded-lg border border-[#e2e8eb] bg-[#f8fafb] p-3" key={activity.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{activity.title}</div>
                  <div className="mt-1 text-xs text-[#5f6368]">
                    {formatGarminActivityDate(activity)} · {activity.sport}
                  </div>
                  {activity.workoutTitle ? (
                    <div className="mt-1 text-xs font-medium text-[#007f7a]">
                      Plan: {activity.workoutTitle}
                    </div>
                  ) : null}
                </div>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#007f7a]">
                  {formatDistanceMeters(activity.distanceMeters)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Czas" value={formatDurationShort(activity.durationSeconds)} />
                <Metric
                  label="Tempo"
                  value={
                    activity.avgPaceSecondsPerKm
                      ? `${formatPaceSeconds(activity.avgPaceSecondsPerKm)}/km`
                      : "-"
                  }
                />
                <Metric label="HR" value={activity.avgHeartRate ?? "-"} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeading(props: {
  description?: string;
  icon: typeof Activity;
  title: string;
}) {
  const Icon = props.icon;

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf7f6] text-[#007f7a]">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#123130]">{props.title}</h3>
        {props.description ? (
          <p className="mt-1 text-sm leading-5 text-[#5f6368]">{props.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function TechnicalField(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-[#5f6368]">{props.label}</div>
      <div className="mt-1 break-all font-mono text-xs text-[#3c4043]">{props.value}</div>
    </div>
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
