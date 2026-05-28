# Plan Wdrożenia MVP: Training Coach

**Summary**
- Budujemy minimalną aplikację webową dla jednego zawodnika: planowanie jednego tygodnia treningów biegowych, generowanie mikrocyklu przez Hugging Face + reguły walidacyjne, edycja planu i mock eksportu do TrainingPeaks.
- Stack: Next.js App Router, TypeScript, Tailwind, Prisma + SQLite, Auth.js Credentials, Zod, Vitest, Playwright.
- Stan obecny: katalog `C:\01_PROJEKTY\Training Coach` jest pusty i nie jest repozytorium Git. `node` i `npm` są dostępne, `hf` CLI nie jest dostępne, więc MVP użyje pakietu `@huggingface/inference`.

**Key Changes**
- Utworzyć nowe repo i projekt Next.js z UI po polsku, bez landing page, pierwszym ekranem ma być narzędzie planowania tygodnia.
- Dodać proste konto użytkownika: email + hasło, jeden profil zawodnika, dane treningowe prywatne dla zalogowanego użytkownika.
- Dodać model danych: `User`, `AthleteProfile`, `IntensityZone`, `RaceResult`, `TrainingPlan`, `Workout`, `GenerationRequest`, `ExportAttempt`.
- Dodać główne widoki:
  - onboarding profilu: poziom, strefy tempa/tętna, czasy 5/10/21/42 km,
  - kreator tygodnia: tydzień, liczba treningów, cele i procenty,
  - kalendarz tygodniowy: lista jednostek, drag and drop między dniami, edycja treningu,
  - podsumowanie tygodnia: rozkład celów, statusy `planned`, `accepted`, `done`, `skipped`, `exported`.
- Dodać API:
  - `GET/PUT /api/profile`
  - `GET/PUT /api/zones`
  - `POST /api/race-results`
  - `POST /api/plans/generate`
  - `GET /api/plans?weekStart=YYYY-MM-DD`
  - `PATCH /api/workouts/:id`
  - `POST /api/workouts/:id/accept`
  - `PATCH /api/workouts/:id/status`
  - `POST /api/workouts/:id/export`

**Generation & Integrations**
- Hugging Face:
  - użyć `@huggingface/inference` i `HF_TOKEN` po stronie serwera,
  - domyślnie model konfigurowalny przez `HF_MODEL`, np. `openai/gpt-oss-120b:fastest`,
  - backend wysyła ustrukturyzowany prompt i oczekuje JSON z listą treningów,
  - odpowiedź walidować Zod: liczba treningów, sport `run`, daty w wybranym tygodniu, cel treningu, czas trwania, strefy, opis jednostki,
  - jeśli AI zwróci błędny JSON, wykonać jeden retry, potem użyć prostego fallbacku regułowego.
- Reguły MVP:
  - tylko bieganie,
  - 1-7 treningów w tygodniu,
  - cele muszą sumować się do 100%,
  - minimum jeden dzień bez mocnego bodźca między ciężkimi jednostkami,
  - strefy tempa i tętna obowiązkowe, moc poza MVP.
- TrainingPeaks:
  - nie integrować realnego API w MVP,
  - utworzyć `TrainingPeaksAdapter` oraz `MockTrainingPeaksAdapter`,
  - mock eksport zapisuje `ExportAttempt` i oznacza trening jako `exported`,
  - realny adapter zostaje pustym miejscem do podpięcia po uzyskaniu dostępu do API.

**GitHub Delivery Plan**
- Zainicjalizować repo Git po rozpoczęciu implementacji.
- Utworzyć milestone `MVP v0.1`.
- Rozbić pracę na issue:
  - bootstrap Next.js, Prisma, auth, CI,
  - profil zawodnika, strefy, wyniki startowe,
  - API generowania planu i klient Hugging Face,
  - walidacja AI + fallback regułowy,
  - widok kalendarza tygodniowego i edycja treningów,
  - mock adapter TrainingPeaks,
  - podsumowanie tygodnia,
  - testy jednostkowe, API i Playwright.
- GitHub Actions: `npm ci`, `npm run lint`, `npm test`, `npm run build`.

**Test Plan**
- Unit tests:
  - walidacja procentów celów,
  - walidacja stref,
  - parser i walidator odpowiedzi AI,
  - fallback generowania,
  - mock eksportu TrainingPeaks.
- API tests:
  - utworzenie profilu,
  - zapis stref,
  - generowanie tygodnia,
  - edycja treningu,
  - akceptacja i eksport mock.
- E2E Playwright:
  - rejestracja użytkownika,
  - uzupełnienie profilu i wyników,
  - wygenerowanie tygodnia z 4 treningami,
  - przesunięcie treningu na inny dzień,
  - edycja jednostki,
  - akceptacja planu,
  - mock eksport,
  - sprawdzenie podsumowania tygodnia.
- Akceptacja MVP:
  - użytkownik może przejść cały proces bez danych zewnętrznych,
  - system generuje dokładnie tyle treningów, ile wybrano,
  - każdy trening ma cel, dzień, czas trwania, strukturę i intensywność,
  - plan można edytować przed eksportem,
  - brak `HF_TOKEN` nie blokuje aplikacji, działa fallback regułowy.

**Assumptions**
- TP oznacza TrainingPeaks.
- Interfejs użytkownika jest po polsku, nazwy techniczne w kodzie po angielsku.
- MVP obsługuje jednego zawodnika i jeden tydzień naraz.
- Historia treningowa w MVP jest ręczna: wyniki 5/10/21/42 km i opcjonalne ostatnie treningi przykładowe.
- Realna integracja TrainingPeaks jest poza MVP, bo oficjalna dokumentacja mówi, że API jest dostępne tylko dla zaakceptowanych developerów: [TrainingPeaks API](https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API).
- Hugging Face będzie użyty przez Inference Providers lub później Inference Endpoints: [Inference Providers](https://huggingface.co/docs/inference-providers/index), [Inference Endpoints](https://huggingface.co/docs/inference-endpoints/main/about).
