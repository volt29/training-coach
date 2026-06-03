# Training Coach UX Audit Evidence

Date: 2026-06-03
Scope: main flow at `http://127.0.0.1:3000/`

## Flow Steps

1. Login/register entry
   - Health: improved.
   - Change: the prefilled demo account is now explained on the login screen; registration clarifies that the user should change the email and use an 8+ character password.

2. Athlete setup
   - Health: improved.
   - Change: pace and heart-rate zone grids no longer force two narrow columns at 1280px, preventing clipped three-digit heart-rate values.

3. Weekly planning
   - Health: improved.
   - Change: coach recommendation actions now separate the secondary action `Wstaw do pól` from the primary action `Generuj z rekomendacji`.

4. Calendar and workout editing
   - Health: improved.
   - Change: the workout editor now offers a keyboard-accessible `Przenieś na dzień` select as an alternative to drag-and-drop.
   - Change: workout actions are grouped into editing, training decision, and export sections.

5. Garmin realization/export
   - Health: improved.
   - Change: developer configuration details are hidden under `Konfiguracja techniczna`.
   - Change: disabled Garmin actions now expose short user-facing reasons.

## Evidence Files

Screenshots captured during final browser QA should be saved in this folder:

- `01-login.png`
- `02-setup-zones.png`
- `03-plan-editor.png`
- `04-garmin-review.png`
- `05-mobile-login.png`
- `06-mobile-setup-zones.png`

## Verification Checklist

- `npm run lint`
- `npm test`
- `npm run test:e2e`
- Browser QA at 1280x720 for login, setup zones, plan editor, and Garmin review
