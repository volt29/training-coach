# Garmin Developer Portal application request

Use this content when creating the app in Garmin Connect Developer Program.

## Program and APIs

- Program: Garmin Connect Developer Program
- Requested APIs: Activity API, Training API
- Requested permissions: `ACTIVITY_EXPORT`, `WORKOUT_IMPORT`
- OAuth: Authorization Code with PKCE
- Data flow:
  - Import completed athlete activities from Garmin Activity API.
  - Store activity metrics for coaching review and workout matching.
  - Publish planned structured workouts to Garmin Connect Calendar using Training API.

## Application description

Training Coach is a coaching platform for runners. Athletes connect their Garmin account so their completed activities can be imported into the coach dashboard and matched against planned workouts. Coaches can also publish planned workouts from Training Coach to Garmin Connect Calendar, so athletes can execute them on compatible Garmin devices.

The integration uses Garmin data only for coaching, training-plan analysis, workout completion tracking, and calendar delivery of planned workouts. The platform does not sell Garmin data.

## Data requested

- Activity summary and detail data needed to review completed workouts:
  - activity date and local date
  - activity type/sport
  - title/name
  - distance
  - elapsed and moving duration
  - average and max heart rate
  - pace/speed
  - calories
  - training effect when available
- Permission and deregistration events to keep account state current.
- Workout import permission for publishing planned workouts to Garmin Connect Calendar.

## Callback values

Set `APP_BASE_URL` first, then copy the values shown in the Garmin panel inside the app.

For production, use a public HTTPS domain:

- Redirect URI: `https://YOUR_DOMAIN/api/garmin/oauth/callback`
- Activity webhook: `https://YOUR_DOMAIN/api/garmin/webhooks/activities`
- Permissions webhook: `https://YOUR_DOMAIN/api/garmin/webhooks/permissions`
- Deregistration webhook: `https://YOUR_DOMAIN/api/garmin/webhooks/deregistration`

For local evaluation with a tunnel, replace `YOUR_DOMAIN` with the tunnel host.

## Security notes

- OAuth tokens are encrypted before persistence.
- Webhooks require `GARMIN_WEBHOOK_SECRET`.
- Callback pull URLs are restricted to HTTPS Garmin hosts from `GARMIN_ALLOWED_PULL_HOSTS`.
- Users can disconnect Garmin, which deletes local connection state and attempts remote deregistration.

## Values to copy back into `.env`

After Garmin accepts the app and issues access, fill:

```env
GARMIN_CLIENT_ID=""
GARMIN_CLIENT_SECRET=""
GARMIN_ACTIVITY_PULL_URL=""
GARMIN_TRAINING_PUSH_URL=""
```

If Garmin provides account-specific endpoints, fill the matching optional overrides:

```env
GARMIN_OAUTH_AUTHORIZE_URL=""
GARMIN_OAUTH_TOKEN_URL=""
GARMIN_USER_ID_URL=""
GARMIN_USER_PERMISSIONS_URL=""
GARMIN_USER_REGISTRATION_URL=""
GARMIN_OAUTH_SCOPES=""
```
