const DAY = 86_400_000;
const saoPaulo = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

export function saoPauloToday(now = new Date()) {
  return saoPaulo.format(now);
}

export function civil(date: string) {
  return new Date(date + "T00:00:00Z");
}

export function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dateKey(year: number, month: number, day: number) {
  return [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function isCivilDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(+civil(date)) && iso(civil(date)) === date;
}

export function addDays(date: string, count: number) {
  return iso(new Date(+civil(date) + count * DAY));
}

export function difference(from: string, to: string) {
  return Math.round((+civil(to) - +civil(from)) / DAY);
}

export function remaining(today: string, target: string) {
  return Math.max(0, difference(today, target));
}

export function countdown(today: string, target: string) {
  const days = remaining(today, target);
  return days === 0 ? "É hoje" : days === 1 ? "Em 1 dia" : `Em ${days} dias`;
}

export function monday(date: string) {
  return addDays(date, -((civil(date).getUTCDay() + 6) % 7));
}

export function week(date: string) {
  const start = monday(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function moveMonth(date: string, step: number) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 + step, 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, last));
  return iso(start);
}

export function monthGrid(date: string) {
  const first = date.slice(0, 7) + "-01";
  const start = monday(first);
  const end = monday(addDays(moveMonth(first, 1), -1));
  return Array.from({ length: difference(start, end) + 7 }, (_, index) => addDays(start, index));
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "UTC" }).format(civil(date));
}

export const longDate = (date: string) => formatDate(date, {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});

export const shortDate = (date: string) => formatDate(date, { day: "numeric", month: "short" });
export const monthLabel = (date: string) => formatDate(date, { month: "long", year: "numeric" });
export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);

export function annualDate(year: number, month: number, day: number) {
  const candidate = dateKey(year, month, day);
  // Observe leap-day birthdays on February 28 in common years.
  return month === 2 && day === 29 && !isCivilDate(candidate) ? dateKey(year, 2, 28) : candidate;
}

export function nextAnnual(today: string, month: number, day: number) {
  const year = Number(today.slice(0, 4));
  const candidate = annualDate(year, month, day);
  return candidate >= today ? candidate : annualDate(year + 1, month, day);
}

// Gregorian computus (Meeus/Jones/Butcher).
export function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return dateKey(year, Math.floor(n / 31), (n % 31) + 1);
}
