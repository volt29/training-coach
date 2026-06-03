import { expect, test } from "@playwright/test";

test("user can register, save profile and generate a four-workout week", async ({ page }) => {
  const email = `runner-${Date.now()}@example.com`;

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByText("Konto demo jest wpisane automatycznie")).toBeVisible();
  await page.getByRole("button", { name: "Nie mam konta" }).click();
  await expect(page.getByText("Zmień email, aby utworzyć nowe konto")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło").fill("runner123");
  await page.getByRole("button", { name: "Zarejestruj i zaloguj" }).click();

  await expect(page.getByRole("heading", { name: "Dane zawodnika" })).toBeVisible();
  await expect(page.getByLabel("Tętno Z1 od")).toBeVisible();
  const heartRateZoneInputBox = await page.getByLabel("Tętno Z1 od").boundingBox();
  expect(heartRateZoneInputBox?.width).toBeGreaterThanOrEqual(80);
  await page.getByLabel("Tydzień").fill("2026-05-04");
  await page.getByRole("button", { name: "Zapisz profil" }).click();
  await page.getByRole("button", { name: "Zapisz strefy" }).click();
  await page.getByRole("button", { name: /Zaplanuj tydzień/ }).click();
  await expect(page.getByRole("heading", { name: "Plan tygodnia" })).toBeVisible();
  await page.getByRole("button", { name: "Generuj plan" }).click();

  await expect(page.getByRole("heading", { name: "Podsumowanie tygodnia" })).toBeVisible();
  await expect(page.getByText("4/4")).toBeVisible();
  await expect(page.getByText("Segmenty tempa i tetna")).toBeVisible();
  await expect(page.getByText("Garmin: Połącz Garmin")).toBeVisible();
  await page.getByRole("button", { name: /Realizacja/ }).click();
  await expect(page.getByRole("heading", { name: "Coach i rekomendacje" })).toBeVisible();
  await expect(page.getByText("Auto plan")).toBeVisible();
  await page.getByRole("button", { name: "Zastosuj rekomendacje" }).click();
  await expect(page.getByText("Rekomendacja coacha zastosowana w kreatorze.")).toBeVisible();
  await page.getByRole("button", { name: "Generuj z rekomendacji" }).click();
  await expect(page.getByText("Plan wygenerowany z rekomendowanym rozkładem celów.")).toBeVisible();
  await page.getByLabel("Przenieś na dzień").selectOption("2026-05-06");
  await expect(page.getByText("Trening przeniesiony.")).toBeVisible();
  await expect(page.getByTestId("day-2026-05-06")).toContainText("Bieg spokojny");
  await page.getByRole("button", { name: /Długi bieg Planowany/ }).click();
  await page.getByRole("button", { name: "Akceptuj" }).click();
  await page.getByRole("button", { name: "TrainingPeaks" }).click();
  await expect(page.getByText("Mock eksportu TrainingPeaks zapisany.")).toBeVisible();
});
