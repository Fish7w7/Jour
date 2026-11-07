import assert from "node:assert/strict";
import test from "node:test";
import { appearanceDefaults, resolveAppearance } from "../lib/appearance.ts";
import { dispatchWindow, dueNotifications, notificationDefaults, pushPlan } from "../lib/notifications.ts";
import { defaultPreferences, scheduleByDate } from "../lib/schedule.ts";
import { exportBackup, readBackup } from "../lib/backup.ts";

function at(plan, instant, activeSince = 0) {
  return dueNotifications(plan, dispatchWindow(Date.parse(instant)), activeSince);
}

const empty = () => structuredClone(pushPlan(defaultPreferences));

test("lembretes padrão usam São Paulo e pulam feriados, folgas e fins de semana", () => {
  const plan = empty();
  assert.deepEqual(at(plan, "2026-11-03T11:59:59Z"), []);
  const [today] = at(plan, "2026-11-03T12:00:00Z");
  assert.equal(today.id, "today:2026-11-03");
  assert.match(today.body, /Hospital.*Atividade prática 7.*13h–17h/);
  assert.equal(at(plan, "2026-11-03T12:09:00Z").length, 1);
  assert.deepEqual(at(plan, "2026-11-03T12:10:00Z"), []);
  assert.deepEqual(at(plan, "2026-11-02T12:00:00Z"), []);
  assert.deepEqual(at(plan, "2026-11-02T02:59:00Z"), []);
  assert.deepEqual(at(plan, "2026-11-07T12:00:00Z"), []);
  assert.equal(at(plan, "2026-11-02T23:00:00Z")[0].id, "tomorrow:2026-11-03");
  assert.deepEqual(at(plan, "2026-11-06T23:00:00Z"), []);
  assert.deepEqual(at(plan, "2026-11-03T12:05:00Z", Date.parse("2026-11-03T12:01:00Z")), []);
});

test("ajustes pessoais e horários mudam os avisos pendentes sem enviar anotações", () => {
  const preferences = structuredClone(defaultPreferences);
  preferences.overrides["2026-11-03"] = {
    kind: "senac", title: "Título privado", notes: "Observação privada", startTime: "14:30", endTime: "18:30",
  };
  preferences.overrides["2026-11-04"] = { kind: "free", title: "Folga pessoal" };
  preferences.notifications = structuredClone(notificationDefaults);
  preferences.notifications.before.enabled = true;
  preferences.notifications.today.time = "10:15";
  const plan = pushPlan(preferences);
  assert.doesNotMatch(JSON.stringify(plan), /privad|Folga pessoal/);
  assert.deepEqual(at(plan, "2026-11-03T12:00:00Z"), []);
  assert.match(at(plan, "2026-11-03T13:15:00Z")[0].body, /Senac · Ajuste pessoal · 14h30–18h30/);
  assert.equal(at(plan, "2026-11-03T16:30:00Z")[0].id, "before:2026-11-03");
  assert.deepEqual(at(plan, "2026-11-03T23:00:00Z"), []);
  plan.settings.before = { enabled: true, time: "11:20", relative: false };
  assert.equal(at(plan, "2026-11-03T14:20:00Z")[0].id, "before:2026-11-03");
  plan.settings.before.time = "15:00";
  assert.deepEqual(at(plan, "2026-11-03T18:00:00Z"), []);
  plan.settings.before.relative = true;
  plan.overrides["2026-11-03"].startTime = "00:30";
  assert.equal(at(plan, "2026-11-03T02:30:00Z")[0].id, "before:2026-11-03");
});

test("aniversários, datas móveis, resumo de domingo e virada do dia", () => {
  const plan = empty();
  plan.settings.weekly = { enabled: true, time: "18:30" };
  plan.birthdays.push({ id: "a", month: 2, day: 29, time: "00:01" });
  plan.dates.push({ title: "Páscoa", time: "10:05" });
  assert.equal(at(plan, "2027-02-28T03:01:00Z")[0].id, "birthday:a:2027-02-28");
  assert.equal(at(plan, "2028-02-29T03:01:00Z")[0].id, "birthday:a:2028-02-29");
  assert.equal(at(plan, "2027-03-28T13:05:00Z")[0].id, "date:Páscoa:2027-03-28");
  assert.equal(at(plan, "2028-04-16T13:05:00Z")[0].id, "date:Páscoa:2028-04-16");
  assert.deepEqual(at(plan, "2026-11-07T21:30:00Z"), []);
  const [weekly] = at(plan, "2026-11-08T21:30:00Z");
  assert.equal(weekly.id, "weekly:2026-11-09");
  assert.match(weekly.body, /9 de nov\..*Senac/);
  plan.dates.push({ title: "Natal", time: "23:58" });
  assert.equal(at(plan, "2026-12-26T03:01:00Z")[0].id, "date:Natal:2026-12-25");
});

test("Hora de sair usa horários opcionais e o destino da programação oficial em São Paulo", () => {
  const plan = empty();
  const departure = (instant) => at(plan, instant).filter(({ id }) => id.startsWith("departure:"));
  assert.deepEqual(departure("2026-11-05T14:45:00Z"), []);
  plan.settings.departure = { enabled: true, hospital: "11:45", senac: "12:10" };
  plan.overrides["2026-11-05"] = { kind: "free" };
  plan.overrides["2026-11-07"] = { kind: "hospital", startTime: "13:00", endTime: "17:00" };
  assert.deepEqual(departure("2026-11-05T14:44:59Z"), []);
  assert.deepEqual(departure("2026-11-05T14:45:00Z"), [{
    id: "departure:2026-11-05", title: "Hora de sair — Hospital",
    body: "Hoje você tem Atividade prática 9, das 13h às 17h. Está na hora de se preparar para sair!",
  }]);
  assert.equal(departure("2026-11-06T15:10:00Z")[0].title, "Hora de sair — Senac");
  for (const date of ["2026-11-02", "2026-11-07", "2028-01-05"]) {
    assert.deepEqual(departure(date + "T14:45:00Z"), []);
  }
  // Simulate official work on a holiday without modifying the official dataset.
  const holiday = scheduleByDate.get("2026-11-02");
  scheduleByDate.set(holiday.date, { ...scheduleByDate.get("2026-11-05"), date: holiday.date });
  try {
    assert.equal(departure("2026-11-02T14:45:00Z")[0].title, "Hora de sair — Hospital");
  } finally {
    scheduleByDate.set(holiday.date, holiday);
  }
  delete plan.settings.departure.senac;
  assert.deepEqual(departure("2026-11-06T15:10:00Z"), []);
  plan.settings.departure.enabled = false;
  assert.deepEqual(departure("2026-11-05T14:45:00Z"), []);
});

test("Hora de sair mantém o lembrete existente quando coincide com o mesmo compromisso", () => {
  const plan = empty();
  plan.settings.departure = { enabled: true, hospital: "09:00" };
  assert.deepEqual(at(plan, "2026-11-05T12:00:00Z").map(({ id }) => id), ["today:2026-11-05"]);
  plan.settings.departure.hospital = "12:00";
  plan.settings.before.enabled = true;
  assert.deepEqual(at(plan, "2026-11-05T15:00:00Z").map(({ id }) => id), ["before:2026-11-05"]);
  plan.settings.today.time = "12:00";
  assert.deepEqual(at(plan, "2026-11-05T15:00:00Z").map(({ id }) => id), ["today:2026-11-05"]);
  plan.settings.today.time = "09:00";
  plan.settings.tomorrow.time = "12:00";
  plan.settings.before.enabled = false;
  assert.deepEqual(at(plan, "2026-11-05T15:00:00Z").map(({ id }) => id), ["tomorrow:2026-11-06", "departure:2026-11-05"]);
});

test("backup mantém preferências de saída e planos enviam somente horários em uso", () => {
  const settings = structuredClone(notificationDefaults);
  const preferences = { ...defaultPreferences, notifications: settings };
  const restore = () => readBackup(exportBackup(preferences), "2026-11-05").notifications;
  assert.deepEqual(restore(), settings);
  settings.departure = { enabled: false, hospital: "11:37" };
  assert.deepEqual(restore().departure, settings.departure);
  assert(!Object.hasOwn(pushPlan(preferences).settings, "departure"));
  settings.departure.enabled = true;
  assert.deepEqual(pushPlan(preferences).settings.departure, settings.departure);
  settings.departure.senac = "24:00";
  assert.throws(restore, /backup válido/);
});

test("backup restaura dados locais, omite credenciais e rejeita esquemas inválidos", () => {
  const preferences = structuredClone(defaultPreferences);
  preferences.theme = "dark";
  preferences.birthdays = [{ id: "a", name: "Pessoa privada", month: 2, day: 29, year: 2000,
    showInCalendar: true, reminder: true, reminderTime: "08:05" }];
  preferences.overrides["2027-01-04"] = { kind: "hospital", title: "Local", startTime: "13:00", endTime: "17:00", notes: "Privado" };
  preferences.dates.Natal = { favorite: true, showInCalendar: true, reminder: true };
  preferences.notifications = structuredClone(notificationDefaults);
  const backup = exportBackup({ ...preferences, token: "secret", pushDevice: {} });
  assert.doesNotMatch(backup, /token|pushDevice|secret/);
  assert.deepEqual(JSON.parse(exportBackup(readBackup(backup, "2026-11-05"))), JSON.parse(backup));
  const plan = pushPlan(preferences);
  assert.doesNotMatch(JSON.stringify(plan), /Pessoa privada|2000|Privado|Local/);
  assert.equal(plan.dates[0].time, "09:00");
  for (const invalid of [
    "{", backup.replace('"version": 1', '"version": 2'), backup.replace('"year": 2000', '"year": 2027'),
    backup.replace('"08:05"', '"24:05"'), backup.replace('"2027-01-04"', '"__proto__"'),
    backup.replace('"Natal"', '"Data inventada"'), backup.replace('"17:00"', '"12:00"'),
  ]) assert.throws(() => readBackup(invalid, "2026-11-05"), /backup válido/);
  const duplicated = { ...preferences, birthdays: [...preferences.birthdays, ...preferences.birthdays] };
  assert.throws(() => readBackup(exportBackup(duplicated), "2026-11-05"), /backup válido/);
});

test("backup preserva a aparência e aceita o esquema anterior sem enviá-la no plano de avisos", () => {
  const old = readBackup(exportBackup(defaultPreferences), "2026-11-05");
  assert.deepEqual(resolveAppearance(old), appearanceDefaults);
  const preferences = { ...defaultPreferences, theme: "dark", accent: "sage", cardStyle: "horizon" };
  const restored = readBackup(exportBackup(preferences), "2026-11-05");
  assert.deepEqual(resolveAppearance(restored), { theme: "dark", accent: "sage", cardStyle: "horizon" });
  assert.deepEqual(pushPlan(restored), pushPlan(defaultPreferences));
  for (const invalid of [{ accent: "toString" }, { accent: null }, { cardStyle: "unknown" }, { cardStyle: false }]) {
    assert.throws(() => readBackup(exportBackup({ ...preferences, ...invalid }), "2026-11-05"), /backup válido/);
  }
});
