import { isCivilDate } from "./dates.ts";
import { accentColors, cardStyles, type Appearance } from "./appearance.ts";
import { object, personalId, readActivity, readNotificationSettings, validTime } from "./notifications.ts";
import { upcomingDates, validBirthday, type Birthday, type DatePreference, type Override, type Preferences } from "./schedule.ts";

export const backupLimit = 1024 * 1024;
export const maxBirthdays = 500;
export const maxOverrides = 1000;
export const importantTitles = new Set(upcomingDates("2026-01-01").map(({ title }) => title));

function invalid(): never {
  throw new Error("O arquivo não é um backup válido do Jour.");
}

const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

function personalReminder(value: Record<string, unknown>) {
  const { showInCalendar, reminder, reminderTime } = value;
  if (typeof showInCalendar !== "boolean" || typeof reminder !== "boolean" ||
      (reminderTime !== undefined && !validTime(reminderTime))) invalid();
  return { showInCalendar, reminder, reminderTime };
}

// Identificador do formato v1, compartilhado com os backups do Jour.
const backupFormat = "rotina-aprendiz";

export function exportBackup(preferences: Preferences) {
  const { theme, accent, cardStyle, birthdays, overrides, dates, notifications } = preferences;
  return JSON.stringify({ format: backupFormat, version: 1, preferences: { theme, accent, cardStyle, birthdays, overrides, dates, notifications } }, null, 2);
}

export function readBackup(content: string, today: string): Preferences {
  let file: unknown;
  try { file = JSON.parse(content); } catch { invalid(); }
  if (!object(file) || file.format !== backupFormat || file.version !== 1 || !object(file.preferences)) invalid();
  const { theme, accent, cardStyle, birthdays, overrides, dates, notifications } = file.preferences;
  if ((theme !== "auto" && theme !== "light" && theme !== "dark") ||
      (accent !== undefined && (typeof accent !== "string" || !Object.hasOwn(accentColors, accent))) ||
      (cardStyle !== undefined && (typeof cardStyle !== "string" || !Object.hasOwn(cardStyles, cardStyle))) ||
      !Array.isArray(birthdays) || birthdays.length > maxBirthdays || !object(overrides) || !object(dates)) invalid();

  const ids = new Set<string>();
  const cleanBirthdays = birthdays.map((value): Birthday => {
    if (!object(value)) invalid();
    const { id, name, month, day, year } = value;
    if (!personalId(id) || ids.has(id) || !text(name, 80) || typeof month !== "number" || typeof day !== "number" ||
        (year !== undefined && typeof year !== "number") || !validBirthday(month, day, year, today)) invalid();
    ids.add(id);
    return { id, name, month, day, year, ...personalReminder(value) };
  });
  const changes = Object.entries(overrides);
  if (changes.length > maxOverrides) invalid();
  const cleanOverrides = Object.fromEntries(changes.map(([date, value]): [string, Override] => {
    if (!isCivilDate(date) || !object(value) || !text(value.title, 100) ||
        (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 500))) invalid();
    const activity = readActivity(value);
    if (!activity) invalid();
    return [date, { ...activity, title: value.title, notes: value.notes }];
  }));
  const cleanDates = Object.fromEntries(Object.entries(dates).map(([title, value]): [string, DatePreference] => {
    if (!importantTitles.has(title) || !object(value) || typeof value.favorite !== "boolean") invalid();
    return [title, { favorite: value.favorite, ...personalReminder(value) }];
  }));
  const settings = notifications === undefined ? undefined : readNotificationSettings(notifications);
  if (notifications !== undefined && !settings) invalid();
  return {
    theme, accent: accent as Appearance["accent"] | undefined, cardStyle: cardStyle as Appearance["cardStyle"] | undefined,
    birthdays: cleanBirthdays, overrides: cleanOverrides, dates: cleanDates, notifications: settings,
  };
}
