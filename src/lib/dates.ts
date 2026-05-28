const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseISODate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error("Invalid ISO date");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function getWeekDates(weekStart: string) {
  const start = parseISODate(weekStart);
  return Array.from({ length: 7 }, (_, index) => toISODate(addDays(start, index)));
}

export function getDayIndex(weekStart: string, date: string) {
  const start = parseISODate(weekStart).getTime();
  const current = parseISODate(date).getTime();
  return Math.round((current - start) / DAY_MS);
}

export function getMondayISO(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return toISODate(addDays(utc, diff));
}

export function isDateInWeek(weekStart: string, date: string) {
  const dayIndex = getDayIndex(weekStart, date);
  return dayIndex >= 0 && dayIndex <= 6;
}
