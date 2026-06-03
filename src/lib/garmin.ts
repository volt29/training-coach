import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

import { WorkoutStatus, type GarminActivity, type GarminConnection, type Prisma, type Workout } from "@prisma/client";

import { addDays, parseISODate, toISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export class GarminIntegrationError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export type GarminConnectionSummary = {
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

export type GarminActivitySummary = {
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

export type GarminDashboard = {
  connection: GarminConnectionSummary;
  config: GarminConfigStatus;
  activities: GarminActivitySummary[];
};

export type GarminConfigStatus = {
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

export type GarminActivityInput = {
  externalId: string;
  startTime: Date;
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
  rawPayload: Record<string, unknown>;
};

export type GarminImportRange = {
  startDate: Date;
  endDate: Date;
};

export type GarminWorkoutExportResult = {
  externalId: string;
  payload: Record<string, unknown>;
  reused?: boolean;
};

type GarminExportAttempt = {
  id: string;
  externalId: string | null;
  payload: string;
  status: string;
  createdAt: Date;
};

export type GarminDisconnectResult = {
  remoteRevoked: boolean;
  remoteError: string | null;
};

type GarminTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type GarminActivityWithWorkout = GarminActivity & {
  workout?: {
    title: string;
  } | null;
};

type GarminActivityPullTimeFormat = "unix-seconds" | "iso-date";

export interface GarminAdapter {
  fetchActivities(
    userId: string,
    connection: GarminConnection,
    range: GarminImportRange
  ): Promise<GarminActivityInput[]>;
  publishWorkout(
    connection: GarminConnection,
    workout: GarminWorkoutInput
  ): Promise<GarminWorkoutExportResult>;
}

type GarminWorkoutInput = Pick<
  Workout,
  | "id"
  | "date"
  | "title"
  | "sport"
  | "goal"
  | "durationMin"
  | "zoneName"
  | "intensity"
  | "structure"
  | "notes"
> & {
  segments?: GarminWorkoutSegmentInput[];
};

type GarminWorkoutSegmentInput = {
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

type JsonRecord = Record<string, unknown>;

const ACTIVITY_EXPORT_PERMISSION = "ACTIVITY_EXPORT";
const WORKOUT_IMPORT_PERMISSION = "WORKOUT_IMPORT";
const GARMIN_PROVIDER = "GarminConnect";
const GARMIN_TOKEN_ENCRYPTION_PREFIX = "enc:v1:";
const GARMIN_IMPORT_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES = 15;
const GARMIN_OAUTH_CALLBACK_PATH = "/api/garmin/oauth/callback";
const GARMIN_ACTIVITY_WEBHOOK_PATH = "/api/garmin/webhooks/activities";
const GARMIN_PERMISSION_WEBHOOK_PATH = "/api/garmin/webhooks/permissions";
const GARMIN_DEREGISTRATION_WEBHOOK_PATH = "/api/garmin/webhooks/deregistration";
export const GARMIN_MAX_IMPORT_RANGE_DAYS = 31;
export const GARMIN_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function readGarminEnv(key: string) {
  const value = process.env[key];
  return value?.trim() ? value.trim() : null;
}

function normalizeGarminPermission(permission: string) {
  return permission.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function splitGarminList(value: string | null | undefined) {
  return value?.split(/\s+/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function getPublicBaseUrl() {
  const baseUrl =
    readGarminEnv("APP_BASE_URL") ??
    readGarminEnv("NEXTAUTH_URL") ??
    readGarminEnv("AUTH_URL");

  return baseUrl?.replace(/\/+$/g, "") ?? null;
}

function getPublicUrl(path: string) {
  const baseUrl = getPublicBaseUrl();
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function getGarminOAuthRedirectUri(requestUrl?: string) {
  const configuredRedirectUri = readGarminEnv("GARMIN_REDIRECT_URI");
  if (configuredRedirectUri) {
    return configuredRedirectUri;
  }

  const baseUrl = getPublicBaseUrl() ?? (requestUrl ? new URL(requestUrl).origin : null);
  return baseUrl ? `${baseUrl}${GARMIN_OAUTH_CALLBACK_PATH}` : GARMIN_OAUTH_CALLBACK_PATH;
}

function getAllowedGarminPullHosts() {
  return splitGarminList(readGarminEnv("GARMIN_ALLOWED_PULL_HOSTS") ?? "apis.garmin.com").map((host) =>
    host.toLowerCase()
  );
}

export function isAllowedGarminPullUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  return getAllowedGarminPullHosts().some(
    (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  );
}

function getRequiredGarminPermissions() {
  const configured = splitGarminList(
    readGarminEnv("GARMIN_REQUIRED_PERMISSIONS") ??
      `${ACTIVITY_EXPORT_PERMISSION} ${WORKOUT_IMPORT_PERMISSION}`
  ).map(normalizeGarminPermission);

  return configured.length > 0
    ? configured
    : [ACTIVITY_EXPORT_PERMISSION, WORKOUT_IMPORT_PERMISSION];
}

export function getGarminConfigStatus(): GarminConfigStatus {
  const missing: string[] = [];
  const oauthReady = Boolean(readGarminEnv("GARMIN_CLIENT_ID") && readGarminEnv("GARMIN_CLIENT_SECRET"));
  const activityPullReady = Boolean(readGarminEnv("GARMIN_ACTIVITY_PULL_URL"));
  const trainingPushReady = Boolean(readGarminEnv("GARMIN_TRAINING_PUSH_URL"));
  const webhookSecretReady = Boolean(readGarminEnv("GARMIN_WEBHOOK_SECRET"));
  const tokenEncryptionReady = Boolean(
    readGarminEnv("GARMIN_TOKEN_ENCRYPTION_KEY") || readGarminEnv("AUTH_SECRET")
  );

  if (!oauthReady) {
    if (!readGarminEnv("GARMIN_CLIENT_ID")) missing.push("GARMIN_CLIENT_ID");
    if (!readGarminEnv("GARMIN_CLIENT_SECRET")) missing.push("GARMIN_CLIENT_SECRET");
  }
  if (!activityPullReady) missing.push("GARMIN_ACTIVITY_PULL_URL");
  if (!trainingPushReady) missing.push("GARMIN_TRAINING_PUSH_URL");
  if (!webhookSecretReady) missing.push("GARMIN_WEBHOOK_SECRET");
  if (!tokenEncryptionReady) missing.push("GARMIN_TOKEN_ENCRYPTION_KEY");

  return {
    oauthReady,
    activityPullReady,
    trainingPushReady,
    webhookSecretReady,
    tokenEncryptionReady,
    missing,
    requiredPermissions: getRequiredGarminPermissions(),
    redirectUri: getGarminOAuthRedirectUri(),
    webhookUrls: {
      activities: getPublicUrl(GARMIN_ACTIVITY_WEBHOOK_PATH),
      permissions: getPublicUrl(GARMIN_PERMISSION_WEBHOOK_PATH),
      deregistration: getPublicUrl(GARMIN_DEREGISTRATION_WEBHOOK_PATH)
    }
  };
}

function getGarminTokenEncryptionKey() {
  const secret = readGarminEnv("GARMIN_TOKEN_ENCRYPTION_KEY") || readGarminEnv("AUTH_SECRET");
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function base64UrlEncode(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

export function encryptGarminToken(token: string | null | undefined) {
  if (!token) return null;
  if (token.startsWith(GARMIN_TOKEN_ENCRYPTION_PREFIX)) return token;

  const key = getGarminTokenEncryptionKey();
  if (!key) return token;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    GARMIN_TOKEN_ENCRYPTION_PREFIX,
    base64UrlEncode(iv),
    base64UrlEncode(authTag),
    base64UrlEncode(ciphertext)
  ].join(".");
}

export function decryptGarminToken(token: string | null | undefined) {
  if (!token) return null;
  if (!token.startsWith(GARMIN_TOKEN_ENCRYPTION_PREFIX)) return token;

  const key = getGarminTokenEncryptionKey();
  if (!key) {
    throw new GarminIntegrationError("Brak klucza szyfrowania tokenow Garmin.", 500);
  }

  const [, ivValue, authTagValue, ciphertextValue] = token.split(".");
  if (!ivValue || !authTagValue || !ciphertextValue) {
    throw new GarminIntegrationError("Nieprawidlowy format zaszyfrowanego tokenu Garmin.", 500);
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, base64UrlDecode(ivValue));
    decipher.setAuthTag(base64UrlDecode(authTagValue));
    return Buffer.concat([
      decipher.update(base64UrlDecode(ciphertextValue)),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new GarminIntegrationError("Nie udalo sie odszyfrowac tokenu Garmin.", 500);
  }
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isGarminWebhookRequestAuthorized(request: Request) {
  const expected = readGarminEnv("GARMIN_WEBHOOK_SECRET");
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }

  const received =
    request.headers.get("x-garmin-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return Boolean(received && constantTimeEquals(received, expected));
}

function permissionsToString(permissions: string[]) {
  return [...new Set(permissions.map(normalizeGarminPermission).filter(Boolean))].join(" ");
}

function readConnectionPermissions(connection: GarminConnection) {
  const permissions =
    connection.mode === "mock"
      ? getRequiredGarminPermissions()
      : splitGarminList(connection.permissions).map(normalizeGarminPermission);

  return {
    permissions,
    known: connection.mode === "mock" || connection.permissions !== null
  };
}

function hasGarminPermission(connection: GarminConnection, permission: string) {
  const state = readConnectionPermissions(connection);
  return !state.known || state.permissions.includes(normalizeGarminPermission(permission));
}

function assertGarminPermission(
  connection: GarminConnection,
  permission: string,
  message: string
) {
  if (!hasGarminPermission(connection, permission)) {
    throw new GarminIntegrationError(message, 403);
  }
}

export function normalizeGarminTokenType(tokenType: string | null | undefined) {
  if (!tokenType) return "Bearer";
  return tokenType.toLowerCase() === "bearer" ? "Bearer" : tokenType;
}

export function garminAccessTokenExpiresAt(expiresIn: number | undefined) {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
    return null;
  }

  const secondsWithSkew = Math.max(0, expiresIn - 600);
  return new Date(Date.now() + secondsWithSkew * 1000);
}

export function garminOAuthStateExpiresAt(now = new Date()) {
  return new Date(now.getTime() + GARMIN_OAUTH_STATE_TTL_MS);
}

export function isGarminOAuthStateExpired(expiresAt: Date, now = new Date()) {
  return expiresAt <= now;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function readNumber(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function dateFromGarminValue(record: JsonRecord) {
  const epochSeconds = readNumber(record, ["startTimeInSeconds", "startTimeSeconds"]);
  if (epochSeconds !== null) {
    return new Date(epochSeconds * 1000);
  }

  const isoDate = readString(record, [
    "startTime",
    "startTimeGMT",
    "startTimeLocal",
    "beginTimestamp"
  ]);
  if (isoDate) {
    const parsed = new Date(isoDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function localDateFromGarminValue(record: JsonRecord, startTime: Date) {
  const localTime = readString(record, ["startTimeLocal", "localStartTime"]);
  if (localTime) {
    const match = localTime.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }
  }

  const epochSeconds = readNumber(record, ["startTimeInSeconds", "startTimeSeconds"]);
  const offsetSeconds = readNumber(record, [
    "startTimeOffsetInSeconds",
    "timezoneOffsetInSeconds",
    "timeZoneOffsetInSeconds"
  ]);
  if (epochSeconds !== null && offsetSeconds !== null) {
    return toISODate(new Date((epochSeconds + offsetSeconds) * 1000));
  }

  return toISODate(startTime);
}

function looksLikeGarminActivity(record: JsonRecord) {
  return Boolean(
    dateFromGarminValue(record) &&
      readNumber(record, [
        "durationInSeconds",
        "durationSeconds",
        "elapsedDuration",
        "elapsedDurationInSeconds"
      ]) !== null
  );
}

function mapSport(sport: string) {
  const normalized = sport.toLowerCase();

  if (normalized.includes("bike") || normalized.includes("cycling")) return "CYCLING";
  if (normalized.includes("swim")) return "SWIMMING";
  if (normalized.includes("strength")) return "STRENGTH_TRAINING";

  return "RUNNING";
}

function estimatePaceSecondsPerKm(workout: GarminWorkoutInput, index = 0) {
  if (workout.segments?.length) {
    const weightedSeconds = workout.segments.reduce((sum, segment) => {
      const midpoint = (segment.paceMinSecPerKm + segment.paceMaxSecPerKm) / 2;
      return sum + midpoint * segment.durationMin;
    }, 0);
    const durationMinutes = workout.segments.reduce((sum, segment) => sum + segment.durationMin, 0);
    if (durationMinutes > 0) {
      return Math.round(weightedSeconds / durationMinutes);
    }
  }

  const normalized = `${workout.zoneName} ${workout.intensity} ${workout.goal}`.toLowerCase();
  if (normalized.includes("z5") || normalized.includes("interval")) return 255 + index * 3;
  if (normalized.includes("z4") || normalized.includes("tempo")) return 285 + index * 3;
  if (normalized.includes("z3")) return 320 + index * 3;
  if (normalized.includes("z1") || normalized.includes("recovery")) return 405 + index * 3;

  return 355 + index * 3;
}

function estimateHeartRateBpm(workout: GarminWorkoutInput, index = 0) {
  if (workout.segments?.length) {
    const weightedBpm = workout.segments.reduce((sum, segment) => {
      const midpoint = (segment.heartRateMinBpm + segment.heartRateMaxBpm) / 2;
      return sum + midpoint * segment.durationMin;
    }, 0);
    const durationMinutes = workout.segments.reduce((sum, segment) => sum + segment.durationMin, 0);
    if (durationMinutes > 0) {
      return Math.round(weightedBpm / durationMinutes);
    }
  }

  return 136 + (index % 5) * 4;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getGarminImportRangeDays(range: GarminImportRange) {
  const start = startOfUtcDay(range.startDate).getTime();
  const end = startOfUtcDay(range.endDate).getTime();

  return Math.floor((end - start) / GARMIN_IMPORT_DAY_MS) + 1;
}

export function assertGarminImportRange(range: GarminImportRange) {
  const days = getGarminImportRangeDays(range);

  if (days <= 0) {
    throw new GarminIntegrationError("Data konca importu musi byc po dacie poczatku.", 400);
  }

  if (days > GARMIN_MAX_IMPORT_RANGE_DAYS) {
    throw new GarminIntegrationError(
      `Zakres importu Garmin moze miec maksymalnie ${GARMIN_MAX_IMPORT_RANGE_DAYS} dni.`,
      400
    );
  }
}

function calendarDayStart(activity: GarminActivityInput) {
  return activity.localDate ? parseISODate(activity.localDate) : startOfUtcDay(activity.startTime);
}

function plannedDurationSeconds(workout: Pick<Workout, "durationMin">) {
  return workout.durationMin * 60;
}

type GarminWorkoutMatchCandidate = Pick<Workout, "sport" | "durationMin"> & {
  garminActivities?: Array<Pick<GarminActivity, "externalId">>;
};

export function getGarminWorkoutMatchScore(
  workout: GarminWorkoutMatchCandidate,
  activity: Pick<GarminActivityInput, "externalId" | "sport" | "durationSeconds">
) {
  const alreadyMatchedToDifferentActivity = workout.garminActivities?.some(
    (garminActivity) => garminActivity.externalId !== activity.externalId
  );
  if (alreadyMatchedToDifferentActivity) {
    return null;
  }

  if (mapSport(workout.sport) !== mapSport(activity.sport)) {
    return null;
  }

  const durationDelta = Math.abs(plannedDurationSeconds(workout) - activity.durationSeconds);
  const thresholdSeconds = Math.max(15 * 60, plannedDurationSeconds(workout) * 0.35);
  if (durationDelta > thresholdSeconds) {
    return null;
  }

  return {
    durationDelta,
    thresholdSeconds
  };
}

function normalizePaceSecondsPerKm(record: JsonRecord, durationSeconds: number) {
  const explicitSeconds = readNumber(record, [
    "avgPaceSecondsPerKm",
    "averagePaceSecondsPerKilometer",
    "averagePaceInSecondsPerKilometer"
  ]);
  if (explicitSeconds !== null && explicitSeconds > 0) {
    return Math.round(explicitSeconds);
  }

  const minutesPerKm = readNumber(record, [
    "averagePaceInMinutesPerKilometer",
    "avgPaceMinutesPerKm",
    "paceInMinutesPerKilometer"
  ]);
  if (minutesPerKm !== null && minutesPerKm > 0) {
    return Math.round(minutesPerKm * 60);
  }

  const metersPerSecond = readNumber(record, [
    "averageSpeedInMetersPerSecond",
    "averageSpeedMetersPerSecond",
    "avgSpeedMetersPerSecond"
  ]);
  if (metersPerSecond !== null && metersPerSecond > 0) {
    return Math.round(1000 / metersPerSecond);
  }

  const distanceMeters = readNumber(record, ["distanceInMeters", "distanceMeters", "distance"]);
  if (distanceMeters !== null && distanceMeters > 0 && durationSeconds > 0) {
    return Math.round((durationSeconds / distanceMeters) * 1000);
  }

  return null;
}

function fallbackGarminActivityExternalId(
  activity: JsonRecord,
  startTime: Date,
  durationSeconds: number,
  fallbackIndex: number
) {
  const sport = readString(activity, ["activityType", "sport", "activityName"]) ?? "RUNNING";
  const distanceMeters = readNumber(activity, ["distanceInMeters", "distanceMeters", "distance"]);
  const distancePart = distanceMeters === null ? "no-distance" : Math.round(distanceMeters);

  return [
    "garmin-activity",
    startTime.toISOString(),
    durationSeconds,
    mapSport(sport),
    distancePart,
    fallbackIndex
  ].join("-");
}

async function findMatchingWorkoutForActivity(
  tx: Prisma.TransactionClient,
  userId: string,
  activity: GarminActivityInput
) {
  const dayStart = calendarDayStart(activity);
  const dayEnd = addDays(dayStart, 1);
  const candidates = await tx.workout.findMany({
    where: {
      userId,
      date: {
        gte: dayStart,
        lt: dayEnd
      },
      status: {
        not: WorkoutStatus.SKIPPED
      }
    },
    include: {
      garminActivities: {
        select: { externalId: true }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const scored = candidates
    .map((workout) => {
      const score = getGarminWorkoutMatchScore(workout, activity);
      return score ? { workout, durationDelta: score.durationDelta } : null;
    })
    .filter((match): match is NonNullable<typeof match> => match !== null)
    .sort((left, right) => left.durationDelta - right.durationDelta);
  const best = scored[0];
  if (!best) {
    return null;
  }

  return best.workout;
}

export function buildGarminWorkoutPayload(workout: GarminWorkoutInput, mode = "mock") {
  const durationSeconds = workout.durationMin * 60;
  const steps = workout.segments?.length
    ? workout.segments.map((segment, index) => ({
        order: index + 1,
        type: "RUN",
        duration: {
          type: "TIME",
          valueSeconds: segment.durationMin * 60
        },
        target: {
          type: "PACE_AND_HEART_RATE_RANGE",
          zoneName: segment.zoneName,
          paceSecondsPerKm: {
            min: segment.paceMinSecPerKm,
            max: segment.paceMaxSecPerKm
          },
          heartRateBpm: {
            min: segment.heartRateMinBpm,
            max: segment.heartRateMaxBpm
          },
          intensity: segment.intensity
        },
        description: `${segment.label}: ${segment.durationMin} min ${segment.zoneName}`,
        notes: segment.notes
      }))
    : [
        {
          order: 1,
          type: "RUN",
          duration: {
            type: "TIME",
            valueSeconds: durationSeconds
          },
          target: {
            type: "INTENSITY_ZONE",
            zoneName: workout.zoneName,
            intensity: workout.intensity
          },
          description: workout.structure
        }
      ];

  return {
    provider: "GarminConnect",
    mode,
    workoutId: workout.id,
    workoutName: workout.title,
    scheduledDate: toISODate(workout.date),
    sport: mapSport(workout.sport),
    estimatedDurationInSeconds: durationSeconds,
    goal: workout.goal,
    description: workout.structure,
    notes: workout.notes,
    steps
  };
}

export function normalizeGarminActivity(rawActivity: unknown, fallbackIndex = 0): GarminActivityInput {
  const activity = asRecord(rawActivity);
  const startTime = dateFromGarminValue(activity);
  const durationSeconds = Math.round(
    readNumber(activity, [
      "durationInSeconds",
      "durationSeconds",
      "elapsedDuration",
      "elapsedDurationInSeconds"
    ]) ?? 0
  );

  if (!startTime || durationSeconds <= 0) {
    throw new GarminIntegrationError("Garmin zwrocil aktywnosc bez daty lub czasu trwania.", 502);
  }

  const externalId =
    readString(activity, ["summaryId", "activityId", "id", "externalId"]) ??
    fallbackGarminActivityExternalId(activity, startTime, durationSeconds, fallbackIndex);
  const distanceMeters = readNumber(activity, ["distanceInMeters", "distanceMeters", "distance"]);
  const localDate = localDateFromGarminValue(activity, startTime);

  return {
    externalId,
    startTime,
    localDate,
    sport: readString(activity, ["activityType", "sport", "activityName"]) ?? "RUNNING",
    title: readString(activity, ["activityName", "title", "name"]) ?? "Garmin activity",
    distanceMeters,
    durationSeconds,
    movingDurationSeconds: Math.round(
      readNumber(activity, ["movingDurationInSeconds", "movingDurationSeconds"]) ??
        durationSeconds
    ),
    avgHeartRate: Math.round(
      readNumber(activity, [
        "averageHeartRateInBeatsPerMinute",
        "avgHeartRate",
        "averageHR"
      ]) ?? 0
    ) || null,
    maxHeartRate: Math.round(
      readNumber(activity, ["maxHeartRateInBeatsPerMinute", "maxHeartRate", "maxHR"]) ?? 0
    ) || null,
    avgPaceSecondsPerKm: normalizePaceSecondsPerKm(activity, durationSeconds),
    calories: Math.round(readNumber(activity, ["activeKilocalories", "calories"]) ?? 0) || null,
    trainingEffect: readNumber(activity, ["aerobicTrainingEffect", "trainingEffect"]),
    rawPayload: activity
  };
}

function mockActivityFromWorkout(workout: GarminWorkoutInput, index: number): GarminActivityInput {
  const durationSeconds = workout.durationMin * 60 + index * 18;
  const avgPaceSecondsPerKm = estimatePaceSecondsPerKm(workout, index);
  const distanceMeters = Math.round((durationSeconds / avgPaceSecondsPerKm) * 1000);
  const avgHeartRate = estimateHeartRateBpm(workout, index);
  const trainingEffect = Number((1.8 + (index % 4) * 0.4).toFixed(1));

  return {
    externalId: `mock-garmin-${workout.id}`,
    startTime: workout.date,
    localDate: toISODate(workout.date),
    sport: mapSport(workout.sport),
    title: workout.title,
    distanceMeters,
    durationSeconds,
    movingDurationSeconds: durationSeconds - 20,
    avgHeartRate,
    maxHeartRate: avgHeartRate + 18,
    avgPaceSecondsPerKm,
    calories: Math.round(distanceMeters * 0.075),
    trainingEffect,
    rawPayload: {
      provider: "GarminConnect",
      mode: "mock",
      workoutId: workout.id
    }
  };
}

function fallbackMockActivities(range: GarminImportRange): GarminActivityInput[] {
  const templates = [
    { offset: 0, title: "Garmin easy run", durationSeconds: 2400, pace: 360, hr: 142 },
    { offset: 2, title: "Garmin tempo run", durationSeconds: 2700, pace: 305, hr: 164 },
    { offset: 5, title: "Garmin long run", durationSeconds: 5400, pace: 375, hr: 149 }
  ];

  return templates
    .map((template, index) => {
      const startTime = addDays(range.startDate, template.offset);
      const distanceMeters = Math.round((template.durationSeconds / template.pace) * 1000);

      return {
        externalId: `mock-garmin-${toISODate(startTime)}-${index}`,
        startTime,
        localDate: toISODate(startTime),
        sport: "RUNNING",
        title: template.title,
        distanceMeters,
        durationSeconds: template.durationSeconds,
        movingDurationSeconds: template.durationSeconds - 30,
        avgHeartRate: template.hr,
        maxHeartRate: template.hr + 22,
        avgPaceSecondsPerKm: template.pace,
        calories: Math.round(distanceMeters * 0.074),
        trainingEffect: Number((2.1 + index * 0.5).toFixed(1)),
        rawPayload: {
          provider: "GarminConnect",
          mode: "mock",
          template: template.title
        }
      };
    })
    .filter((activity) => activity.startTime <= range.endDate);
}

export class MockGarminAdapter implements GarminAdapter {
  async fetchActivities(userId: string, _connection: GarminConnection, range: GarminImportRange) {
    const workouts = await prisma.workout.findMany({
      where: {
        userId,
        date: {
          gte: range.startDate,
          lte: range.endDate
        }
      },
      include: {
        segments: {
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }]
    });

    if (workouts.length === 0) {
      return fallbackMockActivities(range);
    }

    return workouts.map(mockActivityFromWorkout);
  }

  async publishWorkout(connection: GarminConnection, workout: GarminWorkoutInput) {
    const payload = buildGarminWorkoutPayload(workout, connection.mode);

    return {
      externalId: `mock-garmin-calendar-${workout.id}`,
      payload
    };
  }
}

function authHeaders(connection: GarminConnection) {
  const accessToken = decryptGarminToken(connection.accessToken);
  if (!accessToken) {
    throw new GarminIntegrationError("Brak tokenu OAuth Garmin dla tego uzytkownika.", 401);
  }

  return {
    Authorization: `${normalizeGarminTokenType(connection.tokenType)} ${accessToken}`,
    Accept: "application/json"
  };
}

function getGarminTokenUrl() {
  return (
    readGarminEnv("GARMIN_OAUTH_TOKEN_URL") ??
    "https://connectapi.garmin.com/di-oauth2-service/oauth/token"
  );
}

function getGarminUserPermissionsUrl() {
  return (
    readGarminEnv("GARMIN_USER_PERMISSIONS_URL") ??
    "https://apis.garmin.com/wellness-api/rest/user/permissions"
  );
}

function getGarminUserRegistrationUrl() {
  return (
    readGarminEnv("GARMIN_USER_REGISTRATION_URL") ??
    "https://apis.garmin.com/wellness-api/rest/user/registration"
  );
}

function getGarminActivityPullTimeFormat(): GarminActivityPullTimeFormat {
  return readGarminEnv("GARMIN_ACTIVITY_PULL_TIME_FORMAT") === "iso-date" ? "iso-date" : "unix-seconds";
}

function inclusiveEndOfUtcDay(date: Date) {
  return new Date(addDays(startOfUtcDay(date), 1).getTime() - 1000);
}

function formatGarminActivityPullTime(date: Date, format: GarminActivityPullTimeFormat) {
  if (format === "iso-date") {
    return toISODate(date);
  }

  return String(Math.floor(date.getTime() / 1000));
}

function applyGarminActivityPullRange(url: URL, range: GarminImportRange) {
  const startParam =
    readGarminEnv("GARMIN_ACTIVITY_PULL_START_PARAM") ?? "uploadStartTimeInSeconds";
  const endParam = readGarminEnv("GARMIN_ACTIVITY_PULL_END_PARAM") ?? "uploadEndTimeInSeconds";
  const format = getGarminActivityPullTimeFormat();
  const start = startOfUtcDay(range.startDate);
  const end = format === "iso-date" ? range.endDate : inclusiveEndOfUtcDay(range.endDate);

  url.searchParams.set(startParam, formatGarminActivityPullTime(start, format));
  url.searchParams.set(endParam, formatGarminActivityPullTime(end, format));
}

export async function ensureFreshGarminConnection(connection: GarminConnection) {
  if (connection.mode === "mock" || !connection.expiresAt) {
    return connection;
  }

  const expiresSoon = connection.expiresAt.getTime() <= Date.now() + 60 * 1000;
  if (!expiresSoon) {
    return connection;
  }

  const clientId = readGarminEnv("GARMIN_CLIENT_ID");
  const clientSecret = readGarminEnv("GARMIN_CLIENT_SECRET");

  const refreshToken = decryptGarminToken(connection.refreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new GarminIntegrationError("Token Garmin wygasl i nie mozna go odswiezyc.", 401);
  }

  const response = await fetch(getGarminTokenUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    })
  });
  const payload = (await readJsonResponse(response)) as GarminTokenPayload;

  if (!response.ok || !payload.access_token) {
    throw new GarminIntegrationError("Nie udalo sie odswiezyc tokenu Garmin.", 502);
  }

  return prisma.garminConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptGarminToken(payload.access_token),
      refreshToken: payload.refresh_token
        ? encryptGarminToken(payload.refresh_token)
        : connection.refreshToken,
      tokenType: normalizeGarminTokenType(payload.token_type ?? connection.tokenType),
      expiresAt: garminAccessTokenExpiresAt(payload.expires_in) ?? connection.expiresAt,
      scopes: payload.scope ?? connection.scopes
    }
  });
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function parseJsonRecord(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

export function extractGarminPermissionsFromPayload(payload: unknown) {
  const permissions = new Set<string>();

  function collect(value: unknown) {
    if (typeof value === "string") {
      const normalized = normalizeGarminPermission(value);
      if (normalized) permissions.add(normalized);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    const record = asRecord(value);
    if (Object.keys(record).length === 0) {
      return;
    }
    if (record.enabled === false || record.granted === false || record.allowed === false) {
      return;
    }

    for (const key of [
      "permission",
      "permissionName",
      "name",
      "scope",
      "value",
      "permissions",
      "userPermissions",
      "grantedPermissions",
      "data"
    ]) {
      collect(record[key]);
    }
  }

  collect(payload);
  return [...permissions];
}

export async function fetchGarminUserPermissionsForToken(accessToken: string, tokenType = "Bearer") {
  const response = await fetch(getGarminUserPermissionsUrl(), {
    headers: {
      Authorization: `${normalizeGarminTokenType(tokenType)} ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return null;
  }

  return extractGarminPermissionsFromPayload(await readJsonResponse(response));
}

async function fetchGarminConnectionPermissions(connection: GarminConnection) {
  const authorizedConnection = await ensureFreshGarminConnection(connection);
  if (!authorizedConnection.accessToken) {
    return null;
  }

  const accessToken = decryptGarminToken(authorizedConnection.accessToken);
  if (!accessToken) {
    return null;
  }

  return fetchGarminUserPermissionsForToken(
    accessToken,
    authorizedConnection.tokenType ?? "Bearer"
  );
}

async function revokeGarminUserRegistration(connection: GarminConnection) {
  if (connection.mode === "mock") {
    return false;
  }

  const authorizedConnection = await ensureFreshGarminConnection(connection);
  const response = await fetch(getGarminUserRegistrationUrl(), {
    method: "DELETE",
    headers: authHeaders(authorizedConnection)
  });

  if (![200, 202, 204, 404].includes(response.status)) {
    throw new GarminIntegrationError("Garmin odrzucil rozlaczenie konta.", 502);
  }

  return response.status !== 404;
}

export class GarminDeveloperApiAdapter implements GarminAdapter {
  async fetchActivities(_userId: string, connection: GarminConnection, range: GarminImportRange) {
    assertGarminPermission(
      connection,
      ACTIVITY_EXPORT_PERMISSION,
      "Brak zgody Garmin Activity Export dla tego uzytkownika."
    );

    const endpoint = readGarminEnv("GARMIN_ACTIVITY_PULL_URL");
    if (!endpoint) {
      throw new GarminIntegrationError(
        "Ustaw GARMIN_ACTIVITY_PULL_URL po otrzymaniu dostepu do Activity API.",
        501
      );
    }

    const url = new URL(endpoint);
    applyGarminActivityPullRange(url, range);

    const authorizedConnection = await ensureFreshGarminConnection(connection);
    const response = await fetch(url, {
      headers: authHeaders(authorizedConnection)
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new GarminIntegrationError("Garmin Activity API odrzucilo pobranie danych.", 502);
    }

    const payload = asRecord(data);
    const activities = Array.isArray(data)
      ? data
      : Array.isArray(payload.activities)
        ? payload.activities
        : Array.isArray(payload.activitySummaries)
          ? payload.activitySummaries
          : [];

    return activities.map((activity, index) => normalizeGarminActivity(activity, index));
  }

  async publishWorkout(connection: GarminConnection, workout: GarminWorkoutInput) {
    assertGarminPermission(
      connection,
      WORKOUT_IMPORT_PERMISSION,
      "Brak zgody Garmin Workout Import dla tego uzytkownika."
    );

    const endpoint = readGarminEnv("GARMIN_TRAINING_PUSH_URL");
    if (!endpoint) {
      throw new GarminIntegrationError(
        "Ustaw GARMIN_TRAINING_PUSH_URL po otrzymaniu dostepu do Training API.",
        501
      );
    }

    const authorizedConnection = await ensureFreshGarminConnection(connection);
    const payload = buildGarminWorkoutPayload(workout, connection.mode);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...authHeaders(authorizedConnection),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new GarminIntegrationError("Garmin Training API odrzucilo trening.", 502);
    }

    const record = asRecord(data);
    return {
      externalId:
        readString(record, ["workoutId", "id", "externalId"]) ?? `garmin-calendar-${workout.id}`,
      payload: {
        request: payload,
        response: record
      }
    };
  }
}

export function getGarminAdapter(connection: GarminConnection): GarminAdapter {
  if (connection.mode === "mock") {
    return new MockGarminAdapter();
  }

  return new GarminDeveloperApiAdapter();
}

export async function upsertMockGarminConnection(userId: string) {
  return prisma.garminConnection.upsert({
    where: { userId },
    update: {
      mode: "mock",
      providerUserId: `mock-garmin-${userId}`,
      scopes: "ACTIVITY_EXPORT WORKOUT_IMPORT",
      permissions: permissionsToString(getRequiredGarminPermissions()),
      connectedAt: new Date()
    },
    create: {
      userId,
      mode: "mock",
      providerUserId: `mock-garmin-${userId}`,
      scopes: "ACTIVITY_EXPORT WORKOUT_IMPORT",
      permissions: permissionsToString(getRequiredGarminPermissions())
    }
  });
}

export async function disconnectGarminConnection(userId: string) {
  const connection = await prisma.garminConnection.findUnique({
    where: { userId }
  });
  let remoteRevoked = false;
  let remoteError: string | null = null;

  if (connection) {
    try {
      remoteRevoked = await revokeGarminUserRegistration(connection);
    } catch (error) {
      remoteError = error instanceof Error ? error.message : "Nieznany blad Garmin.";
    }
  }

  await prisma.$transaction([
    prisma.garminOAuthState.deleteMany({
      where: { userId }
    }),
    prisma.garminConnection.deleteMany({
      where: { userId }
    })
  ]);

  return {
    remoteRevoked,
    remoteError
  } satisfies GarminDisconnectResult;
}

export async function saveGarminActivitiesForUser(
  userId: string,
  connectionId: string | null,
  activities: GarminActivityInput[]
) {
  let matchedWorkoutCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const activity of activities) {
      const existingActivity = await tx.garminActivity.findUnique({
        where: {
          userId_externalId: {
            userId,
            externalId: activity.externalId
          }
        },
        select: { workoutId: true }
      });
      const matchedWorkout = await findMatchingWorkoutForActivity(tx, userId, activity);
      const workoutId = matchedWorkout?.id ?? null;

      await tx.garminActivity.upsert({
        where: {
          userId_externalId: {
            userId,
            externalId: activity.externalId
          }
        },
        update: {
          connectionId,
          workoutId,
          startTime: activity.startTime,
          localDate: activity.localDate,
          sport: activity.sport,
          title: activity.title,
          distanceMeters: activity.distanceMeters,
          durationSeconds: activity.durationSeconds,
          movingDurationSeconds: activity.movingDurationSeconds,
          avgHeartRate: activity.avgHeartRate,
          maxHeartRate: activity.maxHeartRate,
          avgPaceSecondsPerKm: activity.avgPaceSecondsPerKm,
          calories: activity.calories,
          trainingEffect: activity.trainingEffect,
          rawPayload: JSON.stringify(activity.rawPayload)
        },
        create: {
          userId,
          connectionId,
          workoutId,
          externalId: activity.externalId,
          startTime: activity.startTime,
          localDate: activity.localDate,
          sport: activity.sport,
          title: activity.title,
          distanceMeters: activity.distanceMeters,
          durationSeconds: activity.durationSeconds,
          movingDurationSeconds: activity.movingDurationSeconds,
          avgHeartRate: activity.avgHeartRate,
          maxHeartRate: activity.maxHeartRate,
          avgPaceSecondsPerKm: activity.avgPaceSecondsPerKm,
          calories: activity.calories,
          trainingEffect: activity.trainingEffect,
          rawPayload: JSON.stringify(activity.rawPayload)
        }
      });

      if (matchedWorkout) {
        if (existingActivity?.workoutId !== matchedWorkout.id) {
          matchedWorkoutCount += 1;
        }
        await tx.workout.update({
          where: { id: matchedWorkout.id },
          data: { status: WorkoutStatus.DONE }
        });
      }
    }

    if (connectionId) {
      await tx.garminConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date() }
      });
    }
  });

  return {
    savedCount: activities.length,
    matchedWorkoutCount
  };
}

export function extractGarminActivitiesFromPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => looksLikeGarminActivity(asRecord(item)));
  }

  const record = asRecord(payload);
  const candidateKeys = [
    "activities",
    "activitySummaries",
    "activityDetails",
    "activityDetailSummaries",
    "summaries"
  ];

  for (const key of candidateKeys) {
    if (Array.isArray(record[key])) {
      const activities = (record[key] as unknown[]).filter((item) =>
        looksLikeGarminActivity(asRecord(item))
      );
      if (activities.length > 0) {
        return activities;
      }
    }
  }

  return looksLikeGarminActivity(record) ? [record] : [];
}

export function extractGarminPullUrlsFromPayload(payload: unknown) {
  const urls = new Set<string>();

  function collect(value: unknown) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      urls.add(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = asRecord(value);
    for (const key of [
      "callbackURL",
      "callbackUrl",
      "activityDetailsUrl",
      "activityDetailUrl",
      "detailsUrl",
      "href",
      "url"
    ]) {
      collect(record[key]);
    }

    for (const key of ["links", "activities", "activitySummaries", "pings", "notifications"]) {
      collect(record[key]);
    }
  }

  collect(payload);
  return [...urls];
}

export async function fetchGarminPullPayload(connection: GarminConnection, url: string) {
  if (!isAllowedGarminPullUrl(url)) {
    throw new GarminIntegrationError("Webhook Garmin zawiera niedozwolony adres pobrania.", 400);
  }

  const authorizedConnection = await ensureFreshGarminConnection(connection);
  const response = await fetch(url, {
    headers: authHeaders(authorizedConnection)
  });

  if (!response.ok) {
    throw new GarminIntegrationError(
      `Garmin nie udostepnil danych aktywnosci z callback URL (${response.status}).`,
      502
    );
  }

  return readJsonResponse(response);
}

export function readGarminProviderUserId(payload: unknown) {
  const visited = new Set<unknown>();

  function readFromValue(value: unknown): string | null {
    if (!value || visited.has(value)) {
      return null;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const userId = readFromValue(item);
        if (userId) return userId;
      }
      return null;
    }

    const record = asRecord(value);
    const directUserId = readString(record, [
      "userId",
      "garminUserId",
      "apiUserId",
      "userAccessToken"
    ]);
    if (directUserId) {
      return directUserId;
    }

    for (const key of [
      "deregistrations",
      "userDeregistrations",
      "users",
      "notifications",
      "permissions",
      "activitySummaries",
      "activities"
    ]) {
      const userId = readFromValue(record[key]);
      if (userId) return userId;
    }

    return null;
  }

  return readFromValue(payload);
}

export async function ingestGarminActivityPayload(payload: unknown) {
  const providerUserId = readGarminProviderUserId(payload);
  if (!providerUserId) {
    throw new GarminIntegrationError("Webhook Garmin nie zawiera userId.", 400);
  }

  const connection = await prisma.garminConnection.findFirst({
    where: { providerUserId }
  });
  if (!connection) {
    throw new GarminIntegrationError("Nie znaleziono polaczenia Garmin dla userId z webhooka.", 404);
  }

  const directActivities = extractGarminActivitiesFromPayload(payload);
  const pullUrls = extractGarminPullUrlsFromPayload(payload);
  const pulledPayloads: unknown[] = [];

  if (directActivities.length === 0 && pullUrls.length > 0) {
    for (const url of pullUrls) {
      pulledPayloads.push(await fetchGarminPullPayload(connection, url));
    }
  }

  const activities = [
    ...directActivities,
    ...pulledPayloads.flatMap(extractGarminActivitiesFromPayload)
  ].map((activity, index) => normalizeGarminActivity(activity, index));
  const saveResult = await saveGarminActivitiesForUser(connection.userId, connection.id, activities);

  return {
    userId: connection.userId,
    importedCount: saveResult.savedCount,
    matchedWorkoutCount: saveResult.matchedWorkoutCount
  };
}

export async function ingestGarminPermissionPayload(payload: unknown) {
  const providerUserId = readGarminProviderUserId(payload);
  if (!providerUserId) {
    throw new GarminIntegrationError("Webhook Garmin nie zawiera userId.", 400);
  }

  const permissions = extractGarminPermissionsFromPayload(payload);
  const connection = await prisma.garminConnection.findFirst({
    where: { providerUserId }
  });
  if (!connection) {
    throw new GarminIntegrationError("Nie znaleziono polaczenia Garmin dla userId z webhooka.", 404);
  }

  await prisma.garminConnection.update({
    where: { id: connection.id },
    data: {
      permissions: permissionsToString(permissions)
    }
  });

  return {
    userId: connection.userId,
    permissions
  };
}

export async function ingestGarminDeregistrationPayload(payload: unknown) {
  const providerUserId = readGarminProviderUserId(payload);
  if (!providerUserId) {
    throw new GarminIntegrationError("Webhook Garmin nie zawiera userId.", 400);
  }

  const connection = await prisma.garminConnection.findFirst({
    where: { providerUserId }
  });
  if (!connection) {
    return {
      providerUserId,
      userId: null,
      disconnected: false
    };
  }

  await prisma.$transaction([
    prisma.garminOAuthState.deleteMany({
      where: { userId: connection.userId }
    }),
    prisma.garminConnection.delete({
      where: { id: connection.id }
    })
  ]);

  return {
    providerUserId,
    userId: connection.userId,
    disconnected: true
  };
}

export async function getRequiredGarminConnection(userId: string) {
  const connection = await prisma.garminConnection.findUnique({
    where: { userId }
  });

  if (!connection) {
    throw new GarminIntegrationError("Najpierw polacz konto Garmin Connect.", 400);
  }

  return connection;
}

export async function refreshGarminConnectionPermissions(userId: string) {
  const connection = await getRequiredGarminConnection(userId);
  if (connection.mode === "mock") {
    return connection;
  }

  const permissions = await fetchGarminConnectionPermissions(connection);
  if (permissions === null) {
    throw new GarminIntegrationError("Nie udalo sie pobrac zgod Garmin dla tego uzytkownika.", 502);
  }

  return prisma.garminConnection.update({
    where: { id: connection.id },
    data: {
      permissions: permissionsToString(permissions)
    }
  });
}

export function canExportWorkoutToGarminCalendar(workout: Pick<Workout, "status">) {
  return workout.status !== WorkoutStatus.DONE && workout.status !== WorkoutStatus.SKIPPED;
}

export function buildGarminExportDedupeKey(workoutId: string) {
  return `${GARMIN_PROVIDER}:${workoutId}`;
}

function isPrismaUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
  );
}

function garminExportPendingPayload(workout: Workout) {
  return JSON.stringify({
    state: "PENDING",
    provider: GARMIN_PROVIDER,
    workoutId: workout.id,
    scheduledDate: toISODate(workout.date)
  });
}

function getGarminExportPendingTimeoutMs() {
  const configuredMinutes = Number(process.env.GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES);
  const minutes =
    Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : DEFAULT_GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES;

  return minutes * 60 * 1000;
}

export function isGarminExportAttemptStale(
  attempt: Pick<GarminExportAttempt, "status" | "createdAt">,
  now = new Date()
) {
  return (
    attempt.status === "PENDING" &&
    now.getTime() - attempt.createdAt.getTime() > getGarminExportPendingTimeoutMs()
  );
}

function garminExportStalePayload(workout: Workout) {
  return JSON.stringify({
    error: "Stara rezerwacja eksportu Garmin zostala zwolniona do ponowienia.",
    provider: GARMIN_PROVIDER,
    workoutId: workout.id,
    stale: true
  });
}

async function findReusableGarminExport(userId: string, workoutId: string) {
  return prisma.exportAttempt.findFirst({
    where: {
      userId,
      workoutId,
      provider: GARMIN_PROVIDER,
      status: "SUCCESS",
      externalId: {
        not: null
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

async function reserveGarminExportAttempt(userId: string, workout: Workout, releaseStale = true) {
  const dedupeKey = buildGarminExportDedupeKey(workout.id);

  try {
    return await prisma.exportAttempt.create({
      data: {
        userId,
        workoutId: workout.id,
        provider: GARMIN_PROVIDER,
        status: "PENDING",
        dedupeKey,
        payload: garminExportPendingPayload(workout)
      }
    });
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) {
      throw error;
    }

    const existingAttempt = await prisma.exportAttempt.findUnique({
      where: { dedupeKey }
    });

    if (existingAttempt?.status === "SUCCESS" && existingAttempt.externalId) {
      return existingAttempt;
    }

    if (
      releaseStale &&
      existingAttempt &&
      isGarminExportAttemptStale(existingAttempt)
    ) {
      await prisma.exportAttempt.updateMany({
        where: {
          id: existingAttempt.id,
          status: "PENDING"
        },
        data: {
          status: "FAILED",
          dedupeKey: null,
          payload: garminExportStalePayload(workout)
        }
      });

      return reserveGarminExportAttempt(userId, workout, false);
    }

    throw new GarminIntegrationError("Eksport Garmin dla tego treningu jest juz w toku.", 409);
  }
}

async function markGarminExportAttemptFailed(
  attempt: GarminExportAttempt | null,
  userId: string,
  workoutId: string,
  error: unknown
) {
  if (!attempt && error instanceof GarminIntegrationError && error.status === 409) {
    return;
  }

  const payload = JSON.stringify({
    error: error instanceof Error ? error.message : "Unknown Garmin error"
  });

  if (attempt) {
    await prisma.exportAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        dedupeKey: null,
        payload
      }
    });
    return;
  }

  await prisma.exportAttempt.create({
    data: {
      userId,
      workoutId,
      provider: GARMIN_PROVIDER,
      status: "FAILED",
      payload
    }
  });
}

export async function exportWorkoutToGarminCalendar(userId: string, workout: Workout) {
  let reservedAttempt: GarminExportAttempt | null = null;

  try {
    const existingExport = await findReusableGarminExport(userId, workout.id);

    if (existingExport?.externalId) {
      const updatedWorkout =
        workout.status === WorkoutStatus.PLANNED || workout.status === WorkoutStatus.ACCEPTED
          ? await prisma.workout.update({
              where: { id: workout.id },
              data: { status: WorkoutStatus.EXPORTED },
              include: {
                segments: {
                  orderBy: { sortOrder: "asc" }
                }
              }
            })
          : workout;

      return {
        export: {
          externalId: existingExport.externalId,
          payload: parseJsonRecord(existingExport.payload),
          reused: true
        },
        workout: updatedWorkout
      };
    }

    if (!canExportWorkoutToGarminCalendar(workout)) {
      throw new GarminIntegrationError(
        "Do kalendarza Garmin mozna wysylac tylko treningi, ktore nie sa wykonane ani pominiete.",
        400
      );
    }

    reservedAttempt = await reserveGarminExportAttempt(userId, workout);
    if (reservedAttempt.status === "SUCCESS" && reservedAttempt.externalId) {
      return {
        export: {
          externalId: reservedAttempt.externalId,
          payload: parseJsonRecord(reservedAttempt.payload),
          reused: true
        },
        workout
      };
    }

    const connection = await getRequiredGarminConnection(userId);
    const adapter = getGarminAdapter(connection);
    const exportResult = await adapter.publishWorkout(connection, workout);
    const exportAttemptId = reservedAttempt.id;
    const updatedWorkout = await prisma.$transaction(async (tx) => {
      await tx.exportAttempt.update({
        where: { id: exportAttemptId },
        data: {
          status: "SUCCESS",
          externalId: exportResult.externalId,
          payload: JSON.stringify(exportResult.payload)
        }
      });

      return tx.workout.update({
        where: { id: workout.id },
        data: {
          status:
            workout.status === WorkoutStatus.DONE ? WorkoutStatus.DONE : WorkoutStatus.EXPORTED
        },
        include: {
          segments: {
            orderBy: { sortOrder: "asc" }
          }
        }
      });
    });

    return {
      export: exportResult,
      workout: updatedWorkout
    };
  } catch (error) {
    await markGarminExportAttemptFailed(reservedAttempt, userId, workout.id, error);

    throw error;
  }
}

export function serializeGarminConnection(
  connection: GarminConnection | null
): GarminConnectionSummary {
  if (!connection) {
    return {
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
    };
  }

  const permissionState = readConnectionPermissions(connection);
  const requiredPermissions = getRequiredGarminPermissions();
  const missingPermissions = permissionState.known
    ? requiredPermissions.filter((permission) => !permissionState.permissions.includes(permission))
    : [];

  return {
    connected: true,
    mode: connection.mode,
    providerUserId: connection.providerUserId,
    connectedAt: connection.connectedAt.toISOString(),
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    scopes: splitGarminList(connection.scopes),
    permissions: permissionState.permissions,
    permissionsKnown: permissionState.known,
    missingPermissions,
    canImportActivities: hasGarminPermission(connection, ACTIVITY_EXPORT_PERMISSION),
    canExportWorkouts: hasGarminPermission(connection, WORKOUT_IMPORT_PERMISSION)
  };
}

export function serializeGarminActivity(activity: GarminActivityWithWorkout): GarminActivitySummary {
  return {
    id: activity.id,
    externalId: activity.externalId,
    startTime: activity.startTime.toISOString(),
    localDate: activity.localDate,
    sport: activity.sport,
    title: activity.title,
    distanceMeters: activity.distanceMeters,
    durationSeconds: activity.durationSeconds,
    movingDurationSeconds: activity.movingDurationSeconds,
    avgHeartRate: activity.avgHeartRate,
    maxHeartRate: activity.maxHeartRate,
    avgPaceSecondsPerKm: activity.avgPaceSecondsPerKm,
    calories: activity.calories,
    trainingEffect: activity.trainingEffect,
    source: activity.source,
    workoutId: activity.workoutId,
    workoutTitle: activity.workout?.title ?? null
  };
}

export async function getGarminDashboard(userId: string): Promise<GarminDashboard> {
  const [connection, activities] = await Promise.all([
    prisma.garminConnection.findUnique({ where: { userId } }),
    prisma.garminActivity.findMany({
      where: { userId },
      include: {
        workout: {
          select: { title: true }
        }
      },
      orderBy: { startTime: "desc" },
      take: 8
    })
  ]);

  return {
    connection: serializeGarminConnection(connection),
    config: getGarminConfigStatus(),
    activities: activities.map(serializeGarminActivity)
  };
}
