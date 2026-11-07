import assert from "node:assert/strict";
import test from "node:test";
import { addDays, annualDate, difference, easter, isCivilDate, monthGrid, moveMonth, nextAnnual, remaining, saoPauloToday, week } from "../lib/dates.ts";
import { agendaDay, contractProgress, eventHours, nextCommitment, schedule, scheduleByDate, upcomingDates, validBirthday } from "../lib/schedule.ts";

test("conversão oficial preserva as datas, encontros e casos de referência", () => {
  const references = {
    "2026-11-02": ["holiday", "Finados"],
    "2026-11-03": ["hospital", "Atividade prática 7"],
    "2026-11-04": ["hospital", "Atividade prática 8"],
    "2026-11-05": ["hospital", "Atividade prática 9"],
    "2026-11-06": ["senac", "UC2 · Bem-estar"],
    "2026-11-16": ["senac", "UC6 · Laboratório Juventude"],
    "2026-11-20": ["holiday", "Consciência Negra"],
    "2026-12-25": ["holiday", "Natal"],
    "2027-03-28": ["holiday", "Páscoa"],
    "2027-12-10": ["hospital", "Atividade prática 200"],
  };
  assert.equal(schedule.days.length, 441);
  assert.equal(scheduleByDate.size, 441);
  const first = schedule.contract.start;
  schedule.days.forEach((day, index) => {
    assert.equal(day.date, addDays(first, index));
    assert.ok(day.original);
    const expectedHours = day.kind === "senac" || day.kind === "hospital" ? "13h–17h" : "";
    assert.equal(eventHours(day), expectedHours);
  });
  for (const [date, expected] of Object.entries(references)) {
    const day = scheduleByDate.get(date);
    assert.deepEqual([day.kind, day.title], expected);
  }
  const practices = schedule.days.filter(({ kind }) => kind === "hospital");
  assert.deepEqual(practices.map(({ activityNumber }) => activityNumber), Array.from({ length: 200 }, (_, i) => i + 1));
  assert.equal(schedule.days.filter(({ kind }) => kind === "senac").length, 100);
  assert.equal(schedule.days.filter(({ kind }) => kind === "holiday").length, 18);
  assert.equal(schedule.days.filter(({ kind }) => kind === "free").length, 123);
});

test("o próximo compromisso respeita exceções pessoais e atravessa folgas", () => {
  const adjustments = { "2026-11-06": { kind: "free", title: "Ajuste" } };
  assert.equal(nextCommitment("2026-11-02", {}).event.activityNumber, 7);
  assert.equal(nextCommitment("2026-11-05", adjustments).event.date, "2026-11-09");
  assert.equal(nextCommitment("2026-11-05", {}).event.date, "2026-11-06");
  assert.equal(agendaDay("2026-11-06", adjustments).official.kind, "senac");
  assert.equal(nextCommitment("2027-12-10", {}), undefined);
  assert.equal(nextCommitment("2027-12-10", { "2027-12-13": { kind: "hospital", title: "Extra" } }).event.title, "Extra");
});

test("datas civis seguem São Paulo e preservam a semana e a virada de mês", () => {
  assert.equal(saoPauloToday(new Date("2026-11-05T02:59:59Z")), "2026-11-04");
  assert.equal(saoPauloToday(new Date("2026-11-05T03:00:00Z")), "2026-11-05");
  assert.deepEqual(week("2026-11-05"), [
    "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
  ]);
  const grid = monthGrid("2026-11-05");
  assert.equal(grid[0], "2026-10-26");
  assert.equal(grid.at(-1), "2026-12-06");
  assert.equal(moveMonth("2027-01-31", 1), "2027-02-28");
  assert.equal(difference("2028-02-28", "2028-03-01"), 2);
});

test("fim do contrato chega a zero e o progresso é limitado à vigência", () => {
  assert.equal(remaining("2027-12-09", schedule.contract.end), 1);
  assert.equal(remaining("2027-12-10", schedule.contract.end), 0);
  assert.equal(remaining("2027-12-11", schedule.contract.end), 0);
  assert.equal(contractProgress("2026-09-27"), 0);
  assert.equal(contractProgress("2027-12-10"), 1);
  assert.equal(contractProgress("2027-12-11"), 1);
});

test("recorrências fixas e móveis, incluindo a regra de 29 de fevereiro", () => {
  assert.equal(easter(2027), "2027-03-28");
  assert.equal(easter(2028), "2028-04-16");
  assert.equal(upcomingDates("2027-12-26").find(({ title }) => title === "Natal").date, "2028-12-25");
  assert.equal(upcomingDates("2027-12-26").find(({ title }) => title === "Páscoa").date, "2028-04-16");
  assert.equal(upcomingDates("2026-11-20")[0].date, "2026-11-20");
  assert.equal(annualDate(2027, 2, 29), "2027-02-28");
  assert.equal(nextAnnual("2027-03-01", 2, 29), "2028-02-29");
  assert.ok(validBirthday(2, 29));
  assert.ok(validBirthday(2, 29, 2000));
  assert.ok(!validBirthday(2, 29, 1900));
  assert.ok(!validBirthday(2, 30));
  assert.ok(!validBirthday(12, 1, 2026, "2026-11-05"));
  assert.ok(!isCivilDate("2027-13-01"));
});
