# Garmin Connect integration runbook

## Required Garmin access

Request access in Garmin Connect Developer Program for:

- Activity API - imports completed athlete activities and activity details.
- Training API - publishes planned workouts to Garmin Connect Calendar.
- OAuth 2.0 client credentials.
- Permissions: `ACTIVITY_EXPORT` and `WORKOUT_IMPORT`.

The implementation is ready to run against Garmin once the project receives these credentials and endpoint values. Do not mark the integration complete before a real Garmin account verifies both import and calendar export.

## Environment

Set these values in `.env` or the deployment environment:

```env
APP_BASE_URL="https://your-public-app.example"
GARMIN_CLIENT_ID=""
GARMIN_CLIENT_SECRET=""
GARMIN_ACTIVITY_PULL_URL=""
GARMIN_TRAINING_PUSH_URL=""
GARMIN_WEBHOOK_SECRET=""
GARMIN_TOKEN_ENCRYPTION_KEY=""
GARMIN_REQUIRED_PERMISSIONS="ACTIVITY_EXPORT WORKOUT_IMPORT"
```

Optional overrides are available when Garmin provides account-specific URLs:

```env
GARMIN_REDIRECT_URI=""
GARMIN_OAUTH_AUTHORIZE_URL=""
GARMIN_OAUTH_TOKEN_URL=""
GARMIN_USER_ID_URL=""
GARMIN_USER_PERMISSIONS_URL=""
GARMIN_USER_REGISTRATION_URL=""
GARMIN_OAUTH_SCOPES=""
GARMIN_ACTIVITY_PULL_START_PARAM="uploadStartTimeInSeconds"
GARMIN_ACTIVITY_PULL_END_PARAM="uploadEndTimeInSeconds"
GARMIN_ACTIVITY_PULL_TIME_FORMAT="unix-seconds"
GARMIN_ALLOWED_PULL_HOSTS="apis.garmin.com"
GARMIN_EXPORT_PENDING_TIMEOUT_MINUTES="15"
```

## Garmin Developer Portal values

The app dashboard exposes the current values to copy into Garmin Developer Portal. With `APP_BASE_URL=https://your-public-app.example`, use:

- Redirect URI: `https://your-public-app.example/api/garmin/oauth/callback`
- Activity webhook: `https://your-public-app.example/api/garmin/webhooks/activities`
- Permissions webhook: `https://your-public-app.example/api/garmin/webhooks/permissions`
- Deregistration webhook: `https://your-public-app.example/api/garmin/webhooks/deregistration`

If `GARMIN_REDIRECT_URI` is set, OAuth uses that exact redirect URI instead of deriving it from `APP_BASE_URL`.

## Production validation checklist

1. Run migrations and generate Prisma client:
   `npx.cmd prisma migrate deploy`
   `npx.cmd prisma generate`
2. Start the app on the public URL registered in Garmin Developer Portal.
3. Sign in as a test athlete and connect Garmin with OAuth.
4. Confirm the Garmin panel shows no missing config and no missing permissions.
5. Import a date range containing at least one known Garmin activity.
6. Verify imported distance, duration, pace, HR, calories, training effect, local date, and matched workout.
7. Export one planned workout to Garmin Calendar and confirm it appears in Garmin Connect.
8. Export the same workout again and confirm the app reuses the existing export instead of duplicating it.
9. Export a full week and confirm skipped/completed workouts are not published.
10. Send sample activity, permissions, and deregistration webhook payloads from Garmin or a verified proxy.
11. Run final local gates:
    `npm.cmd test`
    `npm.cmd run lint`
    `npm.cmd run build`
    `npx.cmd prisma migrate status`

## Acceptance criteria

The integration is complete only when:

- A real Garmin OAuth connection succeeds for a test athlete.
- Activity API imports real activity data into `GarminActivity`.
- Imported activities are visible in the app and matched to planned workouts when applicable.
- Training API publishes a planned workout to Garmin Connect Calendar.
- Re-exporting a workout is idempotent.
- Garmin webhooks update activities, permissions, and deregistration state.
- All final local gates pass.
