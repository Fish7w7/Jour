import { importantTitles, maxBirthdays, maxOverrides } from "./backup.ts";
import { isCivilDate } from "./dates.ts";
import { object, personalId, readActivity, readNotificationSettings, validTime, type PushPlan } from "./notifications.ts";
import { validBirthday } from "./schedule.ts";

export type BrowserSubscription = { endpoint: string; keys: { auth: string; p256dh: string } };

function knownEndpoint({ hostname, pathname, search }: URL) {
  if (hostname.endsWith(".notify.windows.com") || hostname.endsWith(".wns.windows.com")) {
    return /^\/w\/?$/.test(pathname) && new URLSearchParams(search).has("token");
  }
  if (search) return false;
  if (hostname === "fcm.googleapis.com") return /^\/(?:fcm\/send|wp)\/[^/]+$/.test(pathname);
  if (hostname === "updates.push.services.mozilla.com") return /^\/wpush\/v[12]\/[^/]+$/.test(pathname);
  return hostname.endsWith(".push.apple.com") && /^\/[^/]+$/.test(pathname);
}

export function subscriptionShape(value: unknown): BrowserSubscription | undefined {
  if (!object(value) || typeof value.endpoint !== "string" || value.endpoint.length > 2048 ||
      !object(value.keys) || typeof value.keys.p256dh !== "string" || typeof value.keys.auth !== "string" ||
      !/^[\w-]{87}$/.test(value.keys.p256dh) || !/^[\w-]{22}$/.test(value.keys.auth)) return;
  const url = URL.parse(value.endpoint);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !knownEndpoint(url)) return;
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

export function parsePlan(value: unknown): PushPlan | undefined {
  if (!object(value) || !Array.isArray(value.birthdays) || value.birthdays.length > maxBirthdays ||
      !Array.isArray(value.dates) || value.dates.length > importantTitles.size || !object(value.overrides)) return;
  const settings = readNotificationSettings(value.settings);
  if (!settings) return;
  const birthdays: PushPlan["birthdays"] = [];
  const ids = new Set();
  for (const item of value.birthdays) {
    if (!object(item) || !personalId(item.id) || ids.has(item.id) || typeof item.month !== "number" || typeof item.day !== "number" || !Number.isInteger(item.month) ||
        !Number.isInteger(item.day) || !validBirthday(item.month, item.day) || !validTime(item.time)) return;
    ids.add(item.id);
    birthdays.push({ id: item.id, month: item.month, day: item.day, time: item.time });
  }
  const dates: PushPlan["dates"] = [];
  const titles = new Set();
  for (const item of value.dates) {
    if (!object(item) || typeof item.title !== "string" || !importantTitles.has(item.title) || titles.has(item.title) || !validTime(item.time)) return;
    titles.add(item.title);
    dates.push({ title: item.title, time: item.time });
  }
  const overrides: PushPlan["overrides"] = {};
  const entries = Object.entries(value.overrides);
  if (entries.length > maxOverrides) return;
  for (const [date, item] of entries) {
    const activity = readActivity(item);
    if (!isCivilDate(date) || !activity) return;
    overrides[date] = activity;
  }
  return { settings, birthdays, dates, overrides };
}
