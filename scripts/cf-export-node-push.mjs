import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { parseSubscription, parsePlan } from "../server/push-validation.mjs";
import { hash } from "../server/push-store.mjs";
import { buildHorizon, calendarVersion, day, deliveryWindow } from "../worker/planning.ts";

function literal(value) {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string") return "'" + value.replaceAll("'", "''") + "'";
  throw new Error("Valor inesperado no SQLite.");
}

export function exportNodePush(source, destination, now = Date.now()) {
  const file = resolve(destination);
  for (const publicDir of ["public", "out"]) {
    const path = relative(resolve(publicDir), file);
    if (path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path)) throw new Error("Use um destino fora de public/ e out/.");
  }
  const db = new DatabaseSync(resolve(source), { readOnly: true });
  let output;
  let complete = false;
  let count = 0;
  try {
    db.exec("BEGIN");
    output = openSync(file, "wx", 0o600);
    const insert = (table, columns, values, ignore = false) => writeSync(output,
      `INSERT ${ignore ? "OR IGNORE " : ""}INTO ${table} (${columns}) VALUES (${values.map(literal).join(",")});\n`);
    writeSync(output, "-- Dados de inscrições. Importe apenas em um D1 vazio e já migrado.\n");
    for (const { id, expires } of db.prepare("SELECT * FROM revoked WHERE expires > ?").iterate(now)) {
      insert("revoked", "id,expires", [id, expires]);
    }
    const deliveries = db.prepare("SELECT occurrence, claimed FROM deliveries WHERE device = ? AND claimed >= ?");
    for (const device of db.prepare("SELECT * FROM devices WHERE last_seen >= ?").iterate(now - 365 * day)) {
      const subscription = parseSubscription(JSON.parse(device.subscription));
      const plan = parsePlan(JSON.parse(device.plan));
      if (!subscription || !plan || !/^[a-f0-9]{64}$/.test(device.id)) throw new Error("Inscrição inválida no SQLite.");
      const encodedSubscription = JSON.stringify(subscription);
      const encodedPlan = JSON.stringify(plan);
      const fingerprint = hash(encodedSubscription + "\n" + encodedPlan);
      const { jobs, refillAt } = buildHorizon(plan, device.id, now, device.active_since);
      // Keep individual SQL statements below D1's statement size limit.
      const [first, ...rest] = encodedPlan.match(/.{1,8000}/gsu);
      insert("devices", "id,endpoint,subscription,plan,fingerprint,calendar_version,revision,active_since,last_seen,refill_at,last_test",
        [device.id, subscription.endpoint, encodedSubscription, first, fingerprint, calendarVersion,
          device.revision, device.active_since, device.last_seen, refillAt, device.last_test]);
      for (const chunk of rest) {
        writeSync(output, `UPDATE devices SET plan = plan || ${literal(chunk)} WHERE id = ${literal(device.id)};\n`);
      }
      const columns = "device,occurrence,fingerprint,calendar_version,title,body,ready_at,expires_at,attempts,pending";
      for (const { occurrence, claimed } of deliveries.iterate(device.id, now - 7 * day)) {
        insert("jobs", columns, [device.id, occurrence, fingerprint, calendarVersion, "", "", claimed, claimed + deliveryWindow, 1, 0]);
      }
      for (const [occurrence, due, title, body] of jobs) {
        insert("jobs", columns, [device.id, occurrence, fingerprint, calendarVersion, title, body, due, due + deliveryWindow, 0, 1], true);
      }
      count++;
    }
    complete = true;
    return count;
  } finally {
    db.close();
    if (output !== undefined) {
      closeSync(output);
      if (!complete) unlinkSync(file);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , source, destination] = process.argv;
  if (!source || !destination) {
    console.error("Uso: node scripts/cf-export-node-push.mjs origem.sqlite destino.sql");
    process.exitCode = 1;
  } else {
    try {
      const count = exportNodePush(source, destination);
      console.log(`${count} inscrição(ões) exportada(s). Guarde o SQL em local privado.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "A exportação falhou.");
      process.exitCode = 1;
    }
  }
}
