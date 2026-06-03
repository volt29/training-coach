import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertGarminImportRange,
  buildGarminWorkoutPayload,
  buildGarminExportDedupeKey,
  canExportWorkoutToGarminCalendar,
  decryptGarminToken,
  encryptGarminToken,
  extractGarminActivitiesFromPayload,
  extractGarminPermissionsFromPayload,
  extractGarminPullUrlsFromPayload,
  fetchGarminPullPayload,
  fetchGarminUserPermissionsForToken,
  garminAccessTokenExpiresAt,
  garminOAuthStateExpiresAt,
  GarminDeveloperApiAdapter,
  GARMIN_MAX_IMPORT_RANGE_DAYS,
  GARMIN_OAUTH_STATE_TTL_MS,
  getGarminImportRangeDays,
  getGarminConfigStatus,
  getGarminWorkoutMatchScore,
  isAllowedGarminPullUrl,
  isGarminExportAttemptStale,
  isGarminOAuthStateExpired,
  isGarminWebhookRequestAuthorized,
  normalizeGarminActivity,
  normalizeGarminTokenType,
  readGarminEnv,
  readGarminProviderUserId
} from "@/lib/garmin";

describe("readGarminEnv", () => {
  it("treats empty optional Garmin environment variables as unset", () => {
    const previous = process.env.GARMIN_OAUTH_TOKEN_URL;

    try {
      process.env.GARMIN_OAUTH_TOKEN_URL = "   ";

      expect(readGarminEnv("GARMIN_OAUTH_TOKEN_URL")).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.GARMIN_OAUTH_TOKEN_URL;
      } else {
        process.env.GARMIN_OAUTH_TOKEN_URL = previous;
      }
    }
  });
});

describe("buildGarminWorkoutPayload", () => {
  it("maps an app workout to a Garmin calendar payload", () => {
    const payload = buildGarminWorkoutPayload({
      id: "workout-1",
      date: new Date("2026-05-18T00:00:00.000Z"),
      title: "Tempo run",
      sport: "run",
      goal: "tempo",
      durationMin: 45,
      zoneName: "Z4",
      intensity: "wysoka",
      structure: "10 min easy, 25 min tempo, 10 min easy",
      notes: null,
      segments: [
        {
          label: "Rozgrzewka",
          durationMin: 10,
          zoneName: "Z1",
          paceMinSecPerKm: 390,
          paceMaxSecPerKm: 480,
          heartRateMinBpm: 115,
          heartRateMaxBpm: 137,
          intensity: "niska",
          notes: null
        },
        {
          label: "Tempo",
          durationMin: 25,
          zoneName: "Z4",
          paceMinSecPerKm: 255,
          paceMaxSecPerKm: 289,
          heartRateMinBpm: 166,
          heartRateMaxBpm: 178,
          intensity: "wysoka",
          notes: null
        }
      ]
    });

    expect(payload).toMatchObject({
      provider: "GarminConnect",
      workoutId: "workout-1",
      scheduledDate: "2026-05-18",
      sport: "RUNNING",
      estimatedDurationInSeconds: 2700
    });
    expect(payload.steps).toHaveLength(2);
    expect(payload.steps[1]).toMatchObject({
      target: {
        type: "PACE_AND_HEART_RATE_RANGE",
        paceSecondsPerKm: { min: 255, max: 289 },
        heartRateBpm: { min: 166, max: 178 }
      }
    });
  });
});

describe("canExportWorkoutToGarminCalendar", () => {
  it("allows planned calendar work and rejects completed or skipped work", () => {
    expect(canExportWorkoutToGarminCalendar({ status: "PLANNED" })).toBe(true);
    expect(canExportWorkoutToGarminCalendar({ status: "ACCEPTED" })).toBe(true);
    expect(canExportWorkoutToGarminCalendar({ status: "EXPORTED" })).toBe(true);
    expect(canExportWorkoutToGarminCalendar({ status: "DONE" })).toBe(false);
    expect(canExportWorkoutToGarminCalendar({ status: "SKIPPED" })).toBe(false);
  });
});

describe("buildGarminExportDedupeKey", () => {
  it("builds a provider-scoped idempotency key for Garmin calendar exports", () => {
    expect(buildGarminExportDedupeKey("workout-1")).toBe("GarminConnect:workout-1");
  });
});

describe("isGarminExportAttemptStale", () => {
  const previousTimeout = process.env.GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES;

  afterEach(() => {
    if (previousTimeout === undefined) {
      delete process.env.GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES;
    } else {
      process.env.GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES = previousTimeout;
    }
  });

  it("marks old pending Garmin calendar exports as stale so they can be retried", () => {
    process.env.GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES = "15";

    expect(
      isGarminExportAttemptStale(
        {
          status: "PENDING",
          createdAt: new Date("2026-06-01T10:00:00.000Z")
        },
        new Date("2026-06-01T10:16:00.000Z")
      )
    ).toBe(true);
  });

  it("keeps recent or already finished Garmin calendar exports locked", () => {
    process.env.GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES = "15";

    expect(
      isGarminExportAttemptStale(
        {
          status: "PENDING",
          createdAt: new Date("2026-06-01T10:10:00.000Z")
        },
        new Date("2026-06-01T10:16:00.000Z")
      )
    ).toBe(false);
    expect(
      isGarminExportAttemptStale(
        {
          status: "SUCCESS",
          createdAt: new Date("2026-06-01T10:00:00.000Z")
        },
        new Date("2026-06-01T10:16:00.000Z")
      )
    ).toBe(false);
  });
});

describe("Garmin import range limits", () => {
  it("counts an inclusive date range for Garmin activity imports", () => {
    expect(
      getGarminImportRangeDays({
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: new Date("2026-06-07T00:00:00.000Z")
      })
    ).toBe(7);
  });

  it("rejects activity import ranges longer than the production limit", () => {
    expect(() =>
      assertGarminImportRange({
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: new Date(
          Date.UTC(2026, 5, 1 + GARMIN_MAX_IMPORT_RANGE_DAYS)
        )
      })
    ).toThrow(`Zakres importu Garmin moze miec maksymalnie ${GARMIN_MAX_IMPORT_RANGE_DAYS} dni.`);
  });
});

describe("getGarminWorkoutMatchScore", () => {
  const activity = {
    externalId: "garmin-activity-1",
    sport: "RUNNING",
    durationSeconds: 3600
  };

  it("scores matching workouts by duration delta", () => {
    expect(
      getGarminWorkoutMatchScore(
        {
          sport: "run",
          durationMin: 58,
          garminActivities: []
        },
        activity
      )
    ).toMatchObject({
      durationDelta: 120
    });
  });

  it("does not match a workout already linked to a different Garmin activity", () => {
    expect(
      getGarminWorkoutMatchScore(
        {
          sport: "run",
          durationMin: 60,
          garminActivities: [{ externalId: "another-garmin-activity" }]
        },
        activity
      )
    ).toBeNull();
  });

  it("allows reimporting the same Garmin activity without blocking its existing workout", () => {
    expect(
      getGarminWorkoutMatchScore(
        {
          sport: "run",
          durationMin: 60,
          garminActivities: [{ externalId: "garmin-activity-1" }]
        },
        activity
      )
    ).toMatchObject({
      durationDelta: 0
    });
  });
});

describe("normalizeGarminActivity", () => {
  it("normalizes activity data from a Garmin-like response", () => {
    const activity = normalizeGarminActivity({
      activityId: "garmin-activity-1",
      activityName: "Morning Run",
      activityType: "RUNNING",
      startTimeInSeconds: 1779091200,
      durationInSeconds: 3600,
      distanceInMeters: 10000,
      averageHeartRateInBeatsPerMinute: 151,
      maxHeartRateInBeatsPerMinute: 174,
      avgPaceSecondsPerKm: 360,
      activeKilocalories: 730,
      aerobicTrainingEffect: 3.2
    });

    expect(activity).toMatchObject({
      externalId: "garmin-activity-1",
      title: "Morning Run",
      sport: "RUNNING",
      durationSeconds: 3600,
      distanceMeters: 10000,
      localDate: "2026-05-18",
      avgHeartRate: 151,
      avgPaceSecondsPerKm: 360,
      trainingEffect: 3.2
    });
  });

  it("converts Garmin minutes-per-kilometer pace to seconds", () => {
    const activity = normalizeGarminActivity({
      summaryId: "garmin-activity-2",
      activityName: "Tempo",
      startTimeInSeconds: 1779091200,
      durationInSeconds: 3300,
      distanceInMeters: 10000,
      averagePaceInMinutesPerKilometer: 5.5
    });

    expect(activity.avgPaceSecondsPerKm).toBe(330);
  });

  it("derives pace from distance and duration when Garmin does not send pace", () => {
    const activity = normalizeGarminActivity({
      summaryId: "garmin-activity-3",
      activityName: "No pace field",
      startTimeInSeconds: 1779091200,
      durationInSeconds: 1800,
      distanceInMeters: 5000
    });

    expect(activity.avgPaceSecondsPerKm).toBe(360);
  });

  it("uses Garmin local offset to preserve the athlete calendar date", () => {
    const startTime = new Date("2026-05-24T22:30:00.000Z");
    const activity = normalizeGarminActivity({
      summaryId: "garmin-activity-4",
      activityName: "Late local run",
      startTimeInSeconds: Math.floor(startTime.getTime() / 1000),
      startTimeOffsetInSeconds: 2 * 60 * 60,
      durationInSeconds: 2400
    });

    expect(activity.startTime.toISOString()).toBe("2026-05-24T22:30:00.000Z");
    expect(activity.localDate).toBe("2026-05-25");
  });

  it("builds a stable fallback external id when Garmin does not send one", () => {
    const first = normalizeGarminActivity(
      {
        activityName: "Fallback id run",
        activityType: "RUNNING",
        startTimeInSeconds: 1779091200,
        durationInSeconds: 1800,
        distanceInMeters: 5000
      },
      0
    );
    const second = normalizeGarminActivity(
      {
        activityName: "Fallback id run",
        activityType: "RUNNING",
        startTimeInSeconds: 1779091200,
        durationInSeconds: 1800,
        distanceInMeters: 5000
      },
      0
    );
    const differentActivity = normalizeGarminActivity(
      {
        activityName: "Fallback id run",
        activityType: "RUNNING",
        startTimeInSeconds: 1779094800,
        durationInSeconds: 1800,
        distanceInMeters: 5000
      },
      0
    );

    expect(first.externalId).toBe(second.externalId);
    expect(first.externalId).toContain("2026-05-18T08:00:00.000Z");
    expect(first.externalId).not.toBe(differentActivity.externalId);
  });
});

describe("Garmin activity webhook helpers", () => {
  const webhookConnection = {
    id: "garmin-connection-1",
    userId: "user-1",
    providerUserId: "garmin-user-1",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    tokenType: "bearer",
    expiresAt: new Date("2026-07-01T00:00:00.000Z"),
    scopes: "PARTNER_READ",
    permissions: "ACTIVITY_EXPORT WORKOUT_IMPORT",
    mode: "oauth",
    connectedAt: new Date("2026-05-01T00:00:00.000Z"),
    lastSyncAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z")
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts pushed activity summaries and provider user id", () => {
    const payload = {
      userId: "garmin-user-1",
      activitySummaries: [
        {
          summaryId: "summary-1",
          activityName: "Webhook run",
          activityType: "RUNNING",
          startTimeInSeconds: 1779091200,
          durationInSeconds: 1800
        }
      ]
    };

    expect(readGarminProviderUserId(payload)).toBe("garmin-user-1");
    expect(extractGarminActivitiesFromPayload(payload)).toHaveLength(1);
  });

  it("does not treat a bare ping notification as an activity", () => {
    const payload = {
      userId: "garmin-user-1",
      callbackURL: "https://apis.garmin.example/activity/pull/123"
    };

    expect(extractGarminActivitiesFromPayload(payload)).toHaveLength(0);
    expect(extractGarminPullUrlsFromPayload(payload)).toEqual([
      "https://apis.garmin.example/activity/pull/123"
    ]);
  });

  it("does not treat nested ping-pull callbacks as activity records", () => {
    const payload = {
      activities: [
        {
          userId: "garmin-user-1",
          callbackURL:
            "https://apis.garmin.com/wellness-api/rest/activityDetails?token=callback-token"
        }
      ]
    };

    expect(readGarminProviderUserId(payload)).toBe("garmin-user-1");
    expect(extractGarminActivitiesFromPayload(payload)).toHaveLength(0);
    expect(extractGarminPullUrlsFromPayload(payload)).toEqual([
      "https://apis.garmin.com/wellness-api/rest/activityDetails?token=callback-token"
    ]);
  });

  it("allows only HTTPS Garmin hosts for ping-pull callbacks", () => {
    expect(isAllowedGarminPullUrl("https://apis.garmin.com/wellness/activity/123")).toBe(true);
    expect(isAllowedGarminPullUrl("https://pull.apis.garmin.com/activity/123")).toBe(true);
    expect(isAllowedGarminPullUrl("http://apis.garmin.com/wellness/activity/123")).toBe(false);
    expect(isAllowedGarminPullUrl("https://example.com/activity/123")).toBe(false);
  });

  it("fails ping-pull ingestion when Garmin callback data cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "not ready" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(
      fetchGarminPullPayload(
        webhookConnection,
        "https://apis.garmin.com/wellness-api/rest/activityDetails?token=callback-token"
      )
    ).rejects.toMatchObject({
      status: 502
    });
  });

  it("reads provider user id from nested deregistration notifications", () => {
    const payload = {
      userDeregistrations: [
        {
          userId: "garmin-user-2",
          reason: "USER_REVOKED"
        }
      ]
    };

    expect(readGarminProviderUserId(payload)).toBe("garmin-user-2");
    expect(extractGarminActivitiesFromPayload(payload)).toHaveLength(0);
  });
});

describe("Garmin webhook authorization", () => {
  afterEach(() => {
    delete process.env.GARMIN_WEBHOOK_SECRET;
  });

  it("accepts supported secret headers and bearer authorization", () => {
    process.env.GARMIN_WEBHOOK_SECRET = "webhook-secret";

    expect(
      isGarminWebhookRequestAuthorized(
        new Request("https://example.com", {
          headers: { "x-garmin-webhook-secret": "webhook-secret" }
        })
      )
    ).toBe(true);
    expect(
      isGarminWebhookRequestAuthorized(
        new Request("https://example.com", {
          headers: { authorization: "Bearer webhook-secret" }
        })
      )
    ).toBe(true);
  });

  it("rejects invalid webhook secrets", () => {
    process.env.GARMIN_WEBHOOK_SECRET = "webhook-secret";

    expect(
      isGarminWebhookRequestAuthorized(
        new Request("https://example.com", {
          headers: { "x-webhook-secret": "wrong-secret" }
        })
      )
    ).toBe(false);
  });
});

describe("Garmin token encryption", () => {
  const previousEncryptionKey = process.env.GARMIN_TOKEN_ENCRYPTION_KEY;
  const previousAuthSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    if (previousEncryptionKey === undefined) {
      delete process.env.GARMIN_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.GARMIN_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
    }

    if (previousAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = previousAuthSecret;
    }
  });

  it("encrypts Garmin OAuth tokens before persistence and decrypts them for API calls", () => {
    process.env.GARMIN_TOKEN_ENCRYPTION_KEY = "test-garmin-token-key";
    delete process.env.AUTH_SECRET;

    const encrypted = encryptGarminToken("garmin-access-token");

    expect(encrypted).toMatch(/^enc:v1:\./);
    expect(encrypted).not.toBe("garmin-access-token");
    expect(decryptGarminToken(encrypted)).toBe("garmin-access-token");
  });

  it("keeps legacy plaintext tokens readable", () => {
    process.env.GARMIN_TOKEN_ENCRYPTION_KEY = "test-garmin-token-key";

    expect(decryptGarminToken("legacy-token")).toBe("legacy-token");
  });
});

describe("Garmin OAuth state lifetime", () => {
  it("uses a short-lived PKCE state and treats the boundary as expired", () => {
    const now = new Date("2026-06-01T10:00:00.000Z");
    const expiresAt = garminOAuthStateExpiresAt(now);

    expect(expiresAt.getTime()).toBe(now.getTime() + GARMIN_OAUTH_STATE_TTL_MS);
    expect(isGarminOAuthStateExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isGarminOAuthStateExpired(expiresAt, expiresAt)).toBe(true);
  });
});

describe("Garmin OAuth permission helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes permission responses and ignores disabled permissions", () => {
    const payload = {
      permissions: [
        "activity export",
        { permissionName: "workout-import", granted: true },
        { permissionName: "health_export", granted: false }
      ]
    };

    expect(extractGarminPermissionsFromPayload(payload)).toEqual([
      "ACTIVITY_EXPORT",
      "WORKOUT_IMPORT"
    ]);
  });

  it("normalizes bearer token type and subtracts expiry skew", () => {
    const before = Date.now();
    const expiresAt = garminAccessTokenExpiresAt(1200);

    expect(normalizeGarminTokenType("bearer")).toBe("Bearer");
    expect(expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 599_000);
    expect(expiresAt?.getTime()).toBeLessThanOrEqual(before + 601_000);
  });

  it("fetches the official user permissions endpoint with bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(["ACTIVITY_EXPORT", "WORKOUT_IMPORT"]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGarminUserPermissionsForToken("token-1", "bearer")).resolves.toEqual([
      "ACTIVITY_EXPORT",
      "WORKOUT_IMPORT"
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://apis.garmin.com/wellness-api/rest/user/permissions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-1"
        })
      })
    );
  });

  it("uses the official permissions endpoint when the override is empty", async () => {
    const previous = process.env.GARMIN_USER_PERMISSIONS_URL;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(["ACTIVITY_EXPORT"]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    try {
      process.env.GARMIN_USER_PERMISSIONS_URL = "";
      vi.stubGlobal("fetch", fetchMock);

      await fetchGarminUserPermissionsForToken("token-1");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://apis.garmin.com/wellness-api/rest/user/permissions",
        expect.any(Object)
      );
    } finally {
      vi.unstubAllGlobals();
      if (previous === undefined) {
        delete process.env.GARMIN_USER_PERMISSIONS_URL;
      } else {
        process.env.GARMIN_USER_PERMISSIONS_URL = previous;
      }
    }
  });
});

describe("GarminDeveloperApiAdapter", () => {
  const connection = {
    id: "garmin-connection-1",
    userId: "user-1",
    providerUserId: "garmin-user-1",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    tokenType: "bearer",
    expiresAt: new Date("2026-07-01T00:00:00.000Z"),
    scopes: "PARTNER_READ",
    permissions: "ACTIVITY_EXPORT WORKOUT_IMPORT",
    mode: "oauth",
    connectedAt: new Date("2026-05-01T00:00:00.000Z"),
    lastSyncAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z")
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GARMIN_ACTIVITY_PULL_URL;
    delete process.env.GARMIN_ACTIVITY_PULL_START_PARAM;
    delete process.env.GARMIN_ACTIVITY_PULL_END_PARAM;
    delete process.env.GARMIN_ACTIVITY_PULL_TIME_FORMAT;
  });

  it("uses Garmin upload-time query parameters and includes the full end day", async () => {
    process.env.GARMIN_ACTIVITY_PULL_URL =
      "https://apis.garmin.com/wellness-api/rest/activities";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new GarminDeveloperApiAdapter().fetchActivities("user-1", connection, {
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-07T00:00:00.000Z")
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(requestedUrl.searchParams.get("uploadStartTimeInSeconds")).toBe(
      String(Date.UTC(2026, 5, 1) / 1000)
    );
    expect(requestedUrl.searchParams.get("uploadEndTimeInSeconds")).toBe(
      String((Date.UTC(2026, 5, 8) - 1000) / 1000)
    );
  });

  it("keeps range query parameters configurable for proxies or evaluation tools", async () => {
    process.env.GARMIN_ACTIVITY_PULL_URL = "https://example.com/garmin/activities";
    process.env.GARMIN_ACTIVITY_PULL_START_PARAM = "startDate";
    process.env.GARMIN_ACTIVITY_PULL_END_PARAM = "endDate";
    process.env.GARMIN_ACTIVITY_PULL_TIME_FORMAT = "iso-date";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activities: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new GarminDeveloperApiAdapter().fetchActivities("user-1", connection, {
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-07T00:00:00.000Z")
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(requestedUrl.searchParams.get("startDate")).toBe("2026-06-01");
    expect(requestedUrl.searchParams.get("endDate")).toBe("2026-06-07");
  });

  it("falls back to official query parameter names when overrides are empty", async () => {
    process.env.GARMIN_ACTIVITY_PULL_URL =
      "https://apis.garmin.com/wellness-api/rest/activities";
    process.env.GARMIN_ACTIVITY_PULL_START_PARAM = "";
    process.env.GARMIN_ACTIVITY_PULL_END_PARAM = "";
    process.env.GARMIN_ACTIVITY_PULL_TIME_FORMAT = "";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activities: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new GarminDeveloperApiAdapter().fetchActivities("user-1", connection, {
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-07T00:00:00.000Z")
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0].toString());
    expect(requestedUrl.searchParams.has("")).toBe(false);
    expect(requestedUrl.searchParams.has("uploadStartTimeInSeconds")).toBe(true);
    expect(requestedUrl.searchParams.has("uploadEndTimeInSeconds")).toBe(true);
  });
});

describe("getGarminConfigStatus", () => {
  it("reports missing production Garmin settings without exposing values", () => {
    const keys = [
      "GARMIN_CLIENT_ID",
      "GARMIN_CLIENT_SECRET",
      "GARMIN_ACTIVITY_PULL_URL",
      "GARMIN_TRAINING_PUSH_URL",
      "GARMIN_WEBHOOK_SECRET"
    ];
    const previous = Object.fromEntries(
      [...keys, "AUTH_SECRET", "GARMIN_TOKEN_ENCRYPTION_KEY"].map((key) => [
        key,
        process.env[key]
      ])
    );

    try {
      for (const key of keys) {
        delete process.env[key];
      }
      process.env.AUTH_SECRET = "test-auth-secret";
      delete process.env.GARMIN_TOKEN_ENCRYPTION_KEY;

      const status = getGarminConfigStatus();

      expect(status.oauthReady).toBe(false);
      expect(status.activityPullReady).toBe(false);
      expect(status.trainingPushReady).toBe(false);
      expect(status.webhookSecretReady).toBe(false);
      expect(status.tokenEncryptionReady).toBe(true);
      expect(status.missing).toEqual(keys);
    } finally {
      for (const key of [...keys, "AUTH_SECRET", "GARMIN_TOKEN_ENCRYPTION_KEY"]) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("does not treat blank Garmin settings as production-ready", () => {
    const keys = [
      "GARMIN_CLIENT_ID",
      "GARMIN_CLIENT_SECRET",
      "GARMIN_ACTIVITY_PULL_URL",
      "GARMIN_TRAINING_PUSH_URL",
      "GARMIN_WEBHOOK_SECRET"
    ];
    const previous = Object.fromEntries(
      [...keys, "AUTH_SECRET", "GARMIN_TOKEN_ENCRYPTION_KEY"].map((key) => [
        key,
        process.env[key]
      ])
    );

    try {
      for (const key of keys) {
        process.env[key] = "   ";
      }
      process.env.AUTH_SECRET = "test-auth-secret";
      delete process.env.GARMIN_TOKEN_ENCRYPTION_KEY;

      const status = getGarminConfigStatus();

      expect(status.oauthReady).toBe(false);
      expect(status.activityPullReady).toBe(false);
      expect(status.trainingPushReady).toBe(false);
      expect(status.webhookSecretReady).toBe(false);
      expect(status.missing).toEqual(keys);
    } finally {
      for (const key of [...keys, "AUTH_SECRET", "GARMIN_TOKEN_ENCRYPTION_KEY"]) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("reports token encryption as missing when encryption secrets are blank", () => {
    const previousAuthSecret = process.env.AUTH_SECRET;
    const previousEncryptionKey = process.env.GARMIN_TOKEN_ENCRYPTION_KEY;

    try {
      process.env.AUTH_SECRET = " ";
      process.env.GARMIN_TOKEN_ENCRYPTION_KEY = "";

      const status = getGarminConfigStatus();

      expect(status.tokenEncryptionReady).toBe(false);
      expect(status.missing).toContain("GARMIN_TOKEN_ENCRYPTION_KEY");
    } finally {
      if (previousAuthSecret === undefined) {
        delete process.env.AUTH_SECRET;
      } else {
        process.env.AUTH_SECRET = previousAuthSecret;
      }

      if (previousEncryptionKey === undefined) {
        delete process.env.GARMIN_TOKEN_ENCRYPTION_KEY;
      } else {
        process.env.GARMIN_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
      }
    }
  });

  it("exposes Garmin Developer Portal callback and webhook values without secrets", () => {
    const previous = Object.fromEntries(
      [
        "APP_BASE_URL",
        "GARMIN_REDIRECT_URI",
        "GARMIN_CLIENT_SECRET",
        "GARMIN_REQUIRED_PERMISSIONS"
      ].map((key) => [key, process.env[key]])
    );

    try {
      process.env.APP_BASE_URL = "https://coach.example.com/";
      delete process.env.GARMIN_REDIRECT_URI;
      process.env.GARMIN_REQUIRED_PERMISSIONS = "activity-export workout-import";
      process.env.GARMIN_CLIENT_SECRET = "super-secret-client-value";

      const status = getGarminConfigStatus();

      expect(status.requiredPermissions).toEqual(["ACTIVITY_EXPORT", "WORKOUT_IMPORT"]);
      expect(status.redirectUri).toBe(
        "https://coach.example.com/api/garmin/oauth/callback"
      );
      expect(status.webhookUrls).toEqual({
        activities: "https://coach.example.com/api/garmin/webhooks/activities",
        permissions: "https://coach.example.com/api/garmin/webhooks/permissions",
        deregistration: "https://coach.example.com/api/garmin/webhooks/deregistration"
      });
      expect(JSON.stringify(status)).not.toContain("super-secret-client-value");
    } finally {
      for (const key of [
        "APP_BASE_URL",
        "GARMIN_REDIRECT_URI",
        "GARMIN_CLIENT_SECRET",
        "GARMIN_REQUIRED_PERMISSIONS"
      ]) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("uses an explicit Garmin redirect URI when the portal requires a fixed value", () => {
    const previousAppBaseUrl = process.env.APP_BASE_URL;
    const previousRedirectUri = process.env.GARMIN_REDIRECT_URI;

    try {
      process.env.APP_BASE_URL = "https://coach.example.com";
      process.env.GARMIN_REDIRECT_URI =
        "https://oauth.example.com/api/garmin/oauth/callback";

      const status = getGarminConfigStatus();

      expect(status.redirectUri).toBe(
        "https://oauth.example.com/api/garmin/oauth/callback"
      );
      expect(status.webhookUrls.activities).toBe(
        "https://coach.example.com/api/garmin/webhooks/activities"
      );
    } finally {
      if (previousAppBaseUrl === undefined) {
        delete process.env.APP_BASE_URL;
      } else {
        process.env.APP_BASE_URL = previousAppBaseUrl;
      }

      if (previousRedirectUri === undefined) {
        delete process.env.GARMIN_REDIRECT_URI;
      } else {
        process.env.GARMIN_REDIRECT_URI = previousRedirectUri;
      }
    }
  });
});
