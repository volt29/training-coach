import { expect, test } from "@playwright/test";

test("user can register, save profile and manage a four-workout microcycle from the calendar", async ({
  page
}) => {
  const email = `runner-${Date.now()}@example.com`;

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByText("Konto demo jest wpisane automatycznie")).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Nie mam konta" }).click();
    await expect(page.getByRole("heading", { name: "Nowe konto" })).toBeVisible({
      timeout: 1000
    });
  }).toPass();
  await expect(page.getByText("Zmień email, aby utworzyć nowe konto")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło").fill("runner123");
  await page.getByRole("button", { name: "Zarejestruj i zaloguj" }).click();

  await expect(page.getByRole("heading", { name: "Kalendarz zawodnika" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profil zawodnika" })).toBeVisible();
  await expect(page.getByLabel("Tętno Z1 od")).toBeVisible();
  const heartRateZoneInputBox = await page.getByLabel("Tętno Z1 od").boundingBox();
  expect(heartRateZoneInputBox?.width).toBeGreaterThanOrEqual(80);

  await page.getByRole("button", { name: "Zapisz profil" }).click();
  await expect(page.getByText("Profil zawodnika zapisany.")).toBeVisible();
  await page.getByRole("button", { name: "Zamknij panel" }).last().click();

  await page.locator("#week-start").fill("2026-05-04");
  await page.getByRole("button", { name: "Generuj plan" }).click();

  await expect(page.getByRole("heading", { name: "Podsumowanie mikrocyklu" })).toBeVisible();
  await expect(page.getByText("4/4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kalendarz tygodnia" })).toBeVisible();
  await expect(page.getByText("Auto plan")).toBeVisible();
  await expect(page.getByText("Ostatnia edycja mikrocyklu:")).toBeVisible();

  await page.locator("#week-start").fill("2026-05-08");
  await expect(page.locator("#week-start")).toHaveValue("2026-05-08");
  await expect(page.getByText("04.05 - 10.05.2026")).toBeVisible();
  await expect(page.getByTestId("day-2026-05-04")).toContainText("Bieg spokojny");
  await expect(page.getByRole("button", { name: "Wygeneruj ponownie" })).toBeVisible();

  await page.getByTestId("next-week").click();
  await expect(page.locator("#week-start")).toHaveValue("2026-05-15");
  await expect(page.getByText("11.05 - 17.05.2026")).toBeVisible();

  await page.getByTestId("previous-week").click();
  await expect(page.locator("#week-start")).toHaveValue("2026-05-08");
  await expect(page.getByText("04.05 - 10.05.2026")).toBeVisible();
  await expect(page.getByTestId("day-2026-05-04")).toContainText("Bieg spokojny");

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Wygeneruj ponownie" }).click();
  await expect(page.getByText("Mikrocykl wygenerowany")).toBeVisible();

  await page.locator('[data-testid^="workout-"]').first().click();
  await expect(page.getByRole("heading", { name: "Szczegóły treningu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Segmenty" })).toBeVisible();
  await expect(page.getByText("Garmin: Połącz Garmin")).toBeVisible();
  await page.getByLabel("Przenieś na dzień").selectOption("2026-05-06");
  await expect(page.getByText("Trening przeniesiony.")).toBeVisible();
  await expect(page.getByTestId("day-2026-05-06")).toContainText("Bieg spokojny");
  await page.getByRole("button", { name: "Oznacz wykonany" }).click();
  await expect(page.getByText("Trening oznaczony jako wykonany.")).toBeVisible();
  await page.getByRole("button", { name: "TrainingPeaks" }).click();
  await expect(page.getByText("Mock eksportu TrainingPeaks zapisany.")).toBeVisible();
});
