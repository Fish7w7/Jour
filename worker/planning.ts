import { addDays, saoPauloToday } from "../lib/dates.ts";
import { plannedNotifications, type PushPlan } from "../lib/notifications.ts";
import { schedule } from "../lib/schedule.ts";

export const minute = 60_000;
export const day = 1440 * minute;
export const deliveryWindow = 10 * minute;
export const calendarVersion = `${schedule.version}:${schedule.sourceSha256}`;
export type PlannedJob = [occurrence: string, due: number, title: string, body: string];

const civilClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function civilMinute(date: string, time: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = civilClock.format(new Date(instant)).replace(" ", "T");
    const offset = target - Date.parse(local + ":00Z");
    if (!offset) return instant;
    instant += offset;
  }
  // Skip a wall-clock minute that does not exist on a timezone transition.
}

export function buildHorizon(plan: PushPlan, deviceId: string, now: number, activeSince: number) {
  const today = saoPauloToday(new Date(now));
  const start = saoPauloToday(new Date(now - deliveryWindow));
  const end = addDays(today, 7);
  const jobs: PlannedJob[] = [];
  for (let date = start; date < end; date = addDays(date, 1)) {
    const times = new Map<string, number | undefined>();
    for (const { time, message } of plannedNotifications(plan, date)) {
      if (!times.has(time)) times.set(time, civilMinute(date, time));
      const due = times.get(time);
      if (due !== undefined && due + deliveryWindow > now && due + minute > activeSince) {
        jobs.push([message.id, due, message.title, message.body]);
      }
    }
  }
  const stagger = (parseInt(deviceId.slice(0, 6), 16) % 1440 - 720) * minute;
  const refillAt = civilMinute(addDays(today, 5), "12:00")! + stagger;
  return { jobs, refillAt };
}

export function retryAt(status: number, retryAfter: string | null, attempts: number, now: number, expires: number) {
  // Retry only explicit temporary refusals. A timeout or an ambiguous response may have delivered.
  if ((status !== 429 && (status !== 503 || !retryAfter)) || attempts >= 3) return;
  const requested = retryAfter && /^\d+$/.test(retryAfter)
    ? now + Number(retryAfter) * 1000
    : retryAfter ? Date.parse(retryAfter) : NaN;
  if (status === 503 && !Number.isFinite(requested)) return;
  const next = Math.max(now + minute * 2 ** (attempts - 1), Number.isFinite(requested) ? requested : now);
  if (next < expires) return next;
}
