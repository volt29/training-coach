import { expect, test } from "@playwright/test";

test("user can register, save profile and generate a four-workout week", async ({ page }) => {
  const email = `runner-${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByRole("button", { name: "Nie mam konta" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Hasło").fill("runner123");
  await page.getByRole("button", { name: "Zarejestruj i zaloguj" }).click();

  await expect(page.getByRole("heading", { name: "Dane zawodnika" })).toBeVisible();
  await page.getByLabel("Tydzień").fill("2026-05-04");
  await page.getByRole("button", { name: "Zapisz profil" }).click();
  await page.getByRole("button", { name: "Zapisz strefy" }).click();
  await page.getByRole("button", { name: /Zaplanuj tydzień/ }).click();
  await expect(page.getByRole("heading", { name: "Plan tygodnia" })).toBeVisible();
  await page.getByRole("button", { name: "Generuj plan" }).click();

  await expect(page.getByRole("heading", { name: "Podsumowanie tygodnia" })).toBeVisible();
  await expect(page.getByText("4/4")).toBeVisible();
  await page.getByRole("button", { name: /Realizacja/ }).click();
  await expect(page.getByRole("heading", { name: "Coach i rekomendacje" })).toBeVisible();
  await expect(page.getByText("Auto plan")).toBeVisible();
  await page.getByRole("button", { name: "Zastosuj rekomendacje" }).click();
  await expect(page.getByText("Rekomendacja coacha zastosowana w kreatorze.")).toBeVisible();
  await page.getByRole("button", { name: "Generuj optymalny plan" }).click();
  await expect(
    page.getByText("Plan wygenerowany automatycznie na podstawie rekomendacji coacha.")
  ).toBeVisible();
  await page.evaluate(() => {
    const source = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Bieg spokojny")
    );
    const target = document.querySelector('[data-testid="day-2026-05-06"]');

    if (!source || !target) {
      throw new Error("Missing drag source or drop target");
    }

    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(page.getByTestId("day-2026-05-06")).toContainText("Bieg spokojny");
  await page.getByRole("button", { name: /Długi bieg Planowany/ }).click();
  await page.getByRole("button", { name: "Akceptuj" }).click();
  await page.getByRole("button", { name: "Eksport TP" }).click();
  await expect(page.getByText("Mock eksportu TrainingPeaks zapisany.")).toBeVisible();
});
