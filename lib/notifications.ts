import { addDays, annualDate, monday, saoPauloToday, shortDate, week } from "./dates.ts";
import { eventHours, kinds, scheduleByDate, upcomingDates, type Preferences, type ScheduleDay, type ScheduleKind } from "./schedule.ts";

export type TimedReminder = { enabled: boolean; time: string };
export type DepartureReminder = { enabled: boolean; hospital?: string; senac?: string };
export type NotificationSettings = {
  tomorrow: TimedReminder;
  today: TimedReminder;
  before: TimedReminder & { relative: boolean };
  weekly: TimedReminder;
  departure?: DepartureReminder;
};

export const notificationDefaults: NotificationSettings = {
  tomorrow: { enabled: true, time: "20:00" },
  today: { enabled: true, time: "09:00" },
  before: { enabled: false, time: "12:00", relative: true },
  weekly: { enabled: false, time: "18:00" },
};
export const personalReminderTime = "09:00";
export const validTime = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export const personalId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(value);
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

type Activity = Pick<ScheduleDay, "kind" | "startTime" | "endTime">;
export type PushPlan = {
  settings: NotificationSettings;
  birthdays: { id: string; month: number; day: number; time: string }[];
  dates: { title: string; time: string }[];
  overrides: Record<string, Activity>;
};
export type PushMessage = { id: string; title: string; body: string };

export function pushPlan(preferences: Preferences): PushPlan {
  const { departure, ...regularSettings } = preferences.notifications ?? notificationDefaults;
  return {
    settings: departure?.enabled && (departure.hospital || departure.senac)
      ? { ...regularSettings, departure }
      : regularSettings,
    birthdays: preferences.birthdays.filter((item) => item.reminder).map(({ id, month, day, reminderTime }) =>
      ({ id, month, day, time: reminderTime ?? personalReminderTime })),
    dates: Object.entries(preferences.dates).filter(([, item]) => item.reminder).map(([title, item]) =>
      ({ title, time: item.reminderTime ?? personalReminderTime })),
    overrides: Object.values(regularSettings).some(({ enabled }) => enabled)
      ? Object.fromEntries(Object.entries(preferences.overrides).map(([date, { kind, startTime, endTime }]) => [date, { kind, startTime, endTime }]))
      : {},
  };
}

export function readNotificationSettings(value: unknown): NotificationSettings | undefined {
  if (!object(value)) return;
  function readRule(rule: unknown): TimedReminder | undefined {
    if (object(rule) && typeof rule.enabled === "boolean" && validTime(rule.time)) return { enabled: rule.enabled, time: rule.time };
  }
  const tomorrow = readRule(value.tomorrow);
  const today = readRule(value.today);
  const before = readRule(value.before);
  const weekly = readRule(value.weekly);
  let departure: DepartureReminder | undefined;
  if (value.departure !== undefined) {
    if (!object(value.departure)) return;
    const { enabled, hospital, senac } = value.departure;
    if (typeof enabled !== "boolean" || (hospital !== undefined && !validTime(hospital)) ||
        (senac !== undefined && !validTime(senac))) return;
    departure = { enabled, ...(hospital !== undefined && { hospital }), ...(senac !== undefined && { senac }) };
  }
  if (tomorrow && today && before && weekly && object(value.before) && typeof value.before.relative === "boolean") {
    return { tomorrow, today, before: { ...before, relative: value.before.relative }, weekly, ...(departure && { departure }) };
  }
}

export function readActivity(value: unknown): Activity | undefined {
  if (!object(value) || typeof value.kind !== "string" || !Object.hasOwn(kinds, value.kind)) return;
  const kind = value.kind as ScheduleKind;
  if (kind === "free" || kind === "holiday") return { kind };
  if (validTime(value.startTime) && validTime(value.endTime) && value.startTime < value.endTime) {
    return { kind, startTime: value.startTime, endTime: value.endTime };
  }
}

const saoPauloTime = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const minuteMs = 60_000;

export function dispatchWindow(now: number, minutes = 10) {
  const window = new Map<string, Map<string, number>>();
  const minute = Math.floor(now / minuteMs) * minuteMs;
  for (let offset = minutes - 1; offset >= 0; offset--) {
    const instant = minute - offset * minuteMs;
    const date = new Date(instant);
    const day = saoPauloToday(date);
    const times = window.get(day) ?? new Map<string, number>();
    times.set(saoPauloTime.format(date), instant);
    window.set(day, times);
  }
  return window;
}

function shiftHour(day: string, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return { day: hour === 0 ? addDays(day, -1) : day, time: String((hour + 23) % 24).padStart(2, "0") + ":" + String(minute).padStart(2, "0") };
}

export function plannedNotifications(plan: PushPlan, day: string, includesTime: (time: string) => boolean = () => true) {
  const messages: { time: string; message: PushMessage }[] = [];
  const { settings } = plan;
  const activity = (date: string) => {
    const override = plan.overrides[date];
    const event = override ? { date, ...override, title: "Ajuste pessoal" } : scheduleByDate.get(date);
    return event?.kind === "hospital" || event?.kind === "senac" ? event : undefined;
  };

  function add(time: string, id: string, title: string, body: string) {
    if (includesTime(time)) messages.push({ time, message: { id, title, body } });
  }
  function work(date: string, time: string, type: string, title: string) {
    const event = activity(date);
    if (!event) return;
    add(time, type + ":" + date, title, `${kinds[event.kind].label} · ${event.title} · ${eventHours(event)}`);
  }
  const tomorrow = addDays(day, 1);
  if (settings.tomorrow.enabled) work(tomorrow, settings.tomorrow.time, "tomorrow", "Compromisso de amanhã");
  if (settings.today.enabled) work(day, settings.today.time, "today", "Compromisso de hoje");
  if (settings.before.enabled) {
    for (const date of settings.before.relative ? [day, tomorrow] : [day]) {
      const event = activity(date);
      if (!event?.startTime) continue;
      const alert = settings.before.relative ? shiftHour(date, event.startTime) : { day: date, time: settings.before.time };
      if (alert.day === day && (day !== date || alert.time < event.startTime)) {
        work(date, alert.time, "before", settings.before.relative ? "Falta uma hora para o compromisso" : "Próximo compromisso");
      }
    }
  }
  if (settings.departure?.enabled) {
    const official = scheduleByDate.get(day);
    if (official?.kind === "hospital" || official?.kind === "senac") {
      const time = settings.departure[official.kind];
      if (time) {
        const effective = activity(day);
        const sameAppointment = effective?.kind === official.kind &&
          effective.startTime === official.startTime && effective.endTime === official.endTime;
        const coinciding = sameAppointment ? messages.filter(({ time: otherTime, message }) =>
          otherTime === time && (message.id === "today:" + day || message.id === "before:" + day)) : [];
        if (coinciding.length > 1) messages.splice(messages.indexOf(coinciding[1]), 1);
        if (coinciding.length === 0) {
          const [start, end] = eventHours(official).split("–");
          const hours = start && end ? `, das ${start} às ${end}` : "";
          add(time, "departure:" + day, `Hora de sair — ${kinds[official.kind].label}`,
            `Hoje você tem ${official.title}${hours}. Está na hora de se preparar para sair!`);
        }
      }
    }
  }
  if (settings.weekly.enabled && day === addDays(monday(day), 6) && includesTime(settings.weekly.time)) {
    const lines = week(tomorrow).flatMap((date) => {
      const event = activity(date);
      return event ? [`${shortDate(date)} · ${kinds[event.kind].label}`] : [];
    });
    add(settings.weekly.time, "weekly:" + tomorrow, "Resumo da próxima semana",
      lines.length ? lines.join("\n") : "A agenda da próxima semana está livre de compromissos.");
  }
  const year = Number(day.slice(0, 4));
  for (const birthday of plan.birthdays) {
    if (annualDate(year, birthday.month, birthday.day) === day) {
      add(birthday.time, `birthday:${birthday.id}:${day}`, "Aniversário hoje", "Abra o Jour para ver seus aniversários.");
    }
  }
  if (plan.dates.length) {
    for (const { title, date } of upcomingDates(day)) {
      const rule = plan.dates.find((item) => item.title === title);
      if (rule && date === day) add(rule.time, `date:${title}:${day}`, "Data importante", title);
    }
  }
  return messages;
}

export function dueNotifications(plan: PushPlan, window: ReturnType<typeof dispatchWindow>, activeSince = 0) {
  return [...window].flatMap(([day, times]) =>
    plannedNotifications(plan, day, (time) => (times.get(time) ?? -Infinity) + minuteMs > activeSince)
      .map(({ message }) => message));
}
