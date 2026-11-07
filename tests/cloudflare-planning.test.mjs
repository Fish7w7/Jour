import assert from "node:assert/strict";
import test from "node:test";
import { pushPlan } from "../lib/notifications.ts";
import { defaultPreferences } from "../lib/schedule.ts";
import { buildHorizon, civilMinute, minute, retryAt } from "../worker/planning.ts";

test("fila usa horário civil de São Paulo e conserva sete dias sem incluir avisos vencidos", () => {
  assert.equal(civilMinute("2026-11-05", "20:00"), Date.parse("2026-11-05T23:00:00Z"));
  assert.equal(civilMinute("2026-11-06", "00:00"), Date.parse("2026-11-06T03:00:00Z"));
  assert.equal(civilMinute("2018-11-04", "00:30"), undefined);
  const now = Date.parse("2026-11-05T12:10:00Z");
  const { jobs, refillAt } = buildHorizon(pushPlan(defaultPreferences), "abcdef", now, 0);
  assert.ok(jobs.length > 0);
  assert.ok(!jobs.some(([id]) => id === "today:2026-11-05" || id === "today:2026-11-07"));
  assert.ok(jobs.some(([id, time]) => id === "tomorrow:2026-11-06" && time === Date.parse("2026-11-05T23:00:00Z")));
  assert.ok(jobs.every(([, time]) => time < Date.parse("2026-11-12T03:00:00Z")));
  assert.ok(refillAt < Date.parse("2026-11-11T03:00:00Z"));
});

test("repetição se limita a recusas transitórias explícitas, dentro da validade", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const expires = now + 10 * minute;
  assert.equal(retryAt(429, "120", 1, now, expires), now + 2 * minute);
  assert.equal(retryAt(503, new Date(now + 3 * minute).toUTCString(), 1, now, expires), now + 3 * minute);
  assert.equal(retryAt(503, "60", 2, now, expires), now + 2 * minute);
  assert.equal(retryAt(503, null, 2, now, expires), undefined);
  assert.equal(retryAt(503, "inválido", 2, now, expires), undefined);
  for (const status of [0, 201, 400, 404, 410, 500, 502, 504]) assert.equal(retryAt(status, null, 1, now, expires), undefined);
  assert.equal(retryAt(503, "600", 1, now, expires), undefined);
  assert.equal(retryAt(429, null, 3, now, expires), undefined);
});
