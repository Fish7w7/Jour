import data from "../data/schedule.json" with { type: "json" };
import { addDays, dateKey, difference, easter, isCivilDate } from "./dates.ts";
import type { NotificationSettings } from "./notifications";
import type { Appearance } from "./appearance";

export type ScheduleKind = "hospital" | "senac" | "holiday" | "free";
export type ScheduleDay = {
  date: string;
  kind: ScheduleKind;
  title: string;
  original?: string;
  activityNumber?: number;
  ucCode?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
};

export type Override = Omit<ScheduleDay, "date" | "original" | "activityNumber" | "ucCode">;
export type Birthday = {
  id: string; name: string; day: number; month: number; year?: number;
  showInCalendar: boolean; reminder: boolean; reminderTime?: string;
};
export type DatePreference = { favorite: boolean; showInCalendar: boolean; reminder: boolean; reminderTime?: string };
export type Preferences = Pick<Appearance, "theme"> & Partial<Pick<Appearance, "accent" | "cardStyle">> & {
  birthdays: Birthday[];
  overrides: Record<string, Override>;
  dates: Record<string, DatePreference>;
  notifications?: NotificationSettings;
};

export const defaultPreferences: Preferences = { theme: "auto", birthdays: [], overrides: {}, dates: {} };
export const defaultDatePreference: DatePreference = { favorite: false, showInCalendar: true, reminder: false };
export const schedule = { ...data, days: data.days as ScheduleDay[] };
export const scheduleByDate = new Map(schedule.days.map((event) => [event.date, event]));
export const kinds = {
  hospital: { label: "Hospital", icon: "hospital" },
  senac: { label: "Senac", icon: "book" },
  holiday: { label: "Feriado", icon: "sparkles" },
  free: { label: "Dia livre", icon: "sun" },
} as const;

export function agendaDay(date: string, overrides: Preferences["overrides"]) {
  const official = scheduleByDate.get(date);
  const personal = overrides[date];
  const event: ScheduleDay = personal ? { date, ...personal } : official ?? {
    date, kind: "free", title: "Sem programação oficial",
  };
  return { event, official, personal };
}

export function nextCommitment(date: string, overrides: Preferences["overrides"]) {
  const candidates = [...new Set([...scheduleByDate.keys(), ...Object.keys(overrides)])].sort();
  for (const candidate of candidates) {
    if (candidate <= date) continue;
    const entry = agendaDay(candidate, overrides);
    if (entry.event.kind === "senac" || entry.event.kind === "hospital") return entry;
  }
}

export function contractProgress(today: string) {
  const { start, end } = schedule.contract;
  return Math.max(0, Math.min(1, difference(start, today) / difference(start, end)));
}

export function eventHours(event: ScheduleDay) {
  if (!event.startTime || !event.endTime) return "";
  return [event.startTime, event.endTime].map((time) => time.replace(":00", "h").replace(":", "h")).join("–");
}

const importantDates = [
  { title: "Ano Novo", month: 1, day: 1 },
  { title: "Carnaval", offset: -47 },
  { title: "Sexta-feira Santa", offset: -2 },
  { title: "Páscoa", offset: 0 },
  { title: "Tiradentes", month: 4, day: 21 },
  { title: "São Jorge", month: 4, day: 23 },
  { title: "Corpus Christi", offset: 60 },
  { title: "São João Batista", month: 6, day: 24 },
  { title: "Independência do Brasil", month: 9, day: 7 },
  { title: "Nossa Senhora Aparecida", month: 10, day: 12 },
  { title: "Finados", month: 11, day: 2 },
  { title: "Proclamação da República", month: 11, day: 15 },
  { title: "Consciência Negra", month: 11, day: 20 },
  { title: "Natal", month: 12, day: 25 },
];
const officialHolidays = new Map(schedule.days.filter((event) => event.kind === "holiday")
  .map((event) => [event.date.slice(0, 4) + ":" + event.title, event.date]));

export function upcomingDates(today: string) {
  const year = Number(today.slice(0, 4));
  return importantDates.map(({ title, month, day, offset }) => {
    const occurrence = (year: number) => {
      const official = officialHolidays.get(year + ":" + title);
      return official ?? (offset === undefined ? dateKey(year, month!, day!) : addDays(easter(year), offset));
    };
    const date = occurrence(year);
    return { title, date: date < today ? occurrence(year + 1) : date };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function validBirthday(month: number, day: number, year?: number, today = "9999-12-31") {
  const date = dateKey(year ?? 2000, month, day);
  return isCivilDate(date) && (year === undefined || (year >= 1 && date <= today));
}
