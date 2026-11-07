import type { D1Database } from "@cloudflare/workers-types";
import { calendarVersion, day, deliveryWindow, type PlannedJob } from "./planning.ts";

type DbDevice = {
  id: string; plan: string; revision: number; active_since: number; last_seen: number;
  fingerprint: string; calendar_version: string; refill_at: number;
};
type DeliveryTarget = { subscription: string; endpoint: string };
export type ClaimedJob = {
  device: string; occurrence: string; title: string; body: string; fingerprint: string;
  attempts: number; expires_at: number;
};
type Horizon = { jobs: PlannedJob[]; refillAt: number };

export function d1Store(db: D1Database) {
  const sql = (statement: string, ...values: (string | number)[]) => db.prepare(statement).bind(...values);
  const get = (id: string) => sql(`SELECT id, revision, active_since, last_seen, fingerprint, calendar_version, refill_at
    FROM devices WHERE id = ?`, id).first<Omit<DbDevice, "plan">>();

  function replaceJobs(id: string, fingerprint: string, revision: number, jobs: PlannedJob[], replace: boolean) {
    const statements = [];
    if (replace) statements.push(sql(`DELETE FROM jobs WHERE device = ? AND pending = 1
      AND (fingerprint <> ? OR calendar_version <> ?)
      AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND fingerprint = ? AND revision = ? AND calendar_version = ?)`,
      id, fingerprint, calendarVersion, id, fingerprint, revision, calendarVersion));
    statements.push(sql(`INSERT OR IGNORE INTO jobs
      (device, occurrence, fingerprint, calendar_version, title, body, ready_at, expires_at)
      SELECT d.id, json_extract(j.value,'$[0]'), d.fingerprint, d.calendar_version,
        json_extract(j.value,'$[2]'), json_extract(j.value,'$[3]'),
        json_extract(j.value,'$[1]'), json_extract(j.value,'$[1]') + ?
      FROM devices d, json_each(?) j
      WHERE d.id = ? AND d.fingerprint = ? AND d.revision = ? AND d.calendar_version = ?`,
      deliveryWindow, JSON.stringify(jobs), id, fingerprint, revision, calendarVersion));
    return statements;
  }

  return {
    get,
    async syncUnchanged(id: string, fingerprint: string, revision: number, now: number) {
      return Boolean(await sql(`UPDATE devices SET revision = ?, last_seen = ?
        WHERE id = ? AND fingerprint = ? AND calendar_version = ? AND revision <= ?
        RETURNING id`, revision, now, id, fingerprint, calendarVersion, revision).first());
    },
    async save(id: string, endpoint: string, subscription: string, plan: string, fingerprint: string,
      revision: number, now: number, horizon: Horizon) {
      const upsert = sql(`INSERT INTO devices (id, endpoint, subscription, plan, fingerprint, calendar_version,
        revision, active_since, last_seen, refill_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM revoked WHERE id = ? AND expires > ?)
        AND NOT EXISTS (SELECT 1 FROM devices WHERE endpoint = ? AND id <> ?)
        AND (EXISTS (SELECT 1 FROM devices WHERE id = ?) OR (SELECT COUNT(*) FROM devices) < 2000)
      ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, subscription = excluded.subscription,
        plan = excluded.plan, fingerprint = excluded.fingerprint, calendar_version = excluded.calendar_version,
        revision = excluded.revision, last_seen = excluded.last_seen, refill_at = excluded.refill_at,
        active_since = CASE WHEN devices.fingerprint = excluded.fingerprint THEN devices.active_since ELSE excluded.active_since END
      WHERE devices.revision < excluded.revision OR (devices.revision = excluded.revision AND devices.fingerprint = excluded.fingerprint)
      RETURNING id`, id, endpoint, subscription, plan, fingerprint, calendarVersion, revision, now, now, horizon.refillAt,
        id, now, endpoint, id, id);
      const [saved] = await db.batch([upsert, ...replaceJobs(id, fingerprint, revision, horizon.jobs, true)]);
      if (saved.results.length) return 204;
      const failure = await sql(`SELECT CASE
        WHEN EXISTS (SELECT 1 FROM revoked WHERE id = ? AND expires > ?) THEN 410
        WHEN EXISTS (SELECT 1 FROM devices WHERE id = ? OR endpoint = ?) THEN 409 ELSE 503 END AS code`,
        id, now, id, endpoint).first<{ code: number }>();
      return failure?.code ?? 503;
    },
    async revoke(id: string, now: number, expectedEndpoint?: string) {
      const expires = now + 7 * day;
      if (expectedEndpoint !== undefined) {
        await db.batch([
          sql(`INSERT OR REPLACE INTO revoked SELECT id, ? FROM devices WHERE id = ? AND endpoint = ?`, expires, id, expectedEndpoint),
          sql("DELETE FROM devices WHERE id = ? AND endpoint = ?", id, expectedEndpoint),
        ]);
        return;
      }
      await db.batch([
        sql("INSERT OR REPLACE INTO revoked VALUES (?, ?)", id, expires),
        sql("DELETE FROM devices WHERE id = ?", id),
      ]);
    },
    async reserveTest(id: string, now: number) {
      return sql(`UPDATE devices SET last_test = ? WHERE id = ? AND last_seen >= ?
        AND (last_test IS NULL OR last_test <= ?) RETURNING subscription, endpoint`,
      now, id, now - 365 * day, now - 60_000).first<DeliveryTarget>();
    },
    async claim(now: number, max: number) {
      const result = await sql(`UPDATE jobs SET pending = 0, attempts = attempts + 1
        WHERE rowid IN (SELECT j.rowid FROM jobs j WHERE j.pending = 1 AND j.calendar_version = ?
          AND j.ready_at > ? AND j.ready_at <= ? AND j.expires_at > ?
          AND EXISTS (SELECT 1 FROM devices d WHERE d.id = j.device AND d.last_seen >= ?)
          ORDER BY j.ready_at LIMIT ?)
        RETURNING device, occurrence, title, body, fingerprint, attempts, expires_at`,
      calendarVersion, now - deliveryWindow, now, now, now - 365 * day, max).all<ClaimedJob>();
      return result.results;
    },
    activeTarget(job: ClaimedJob) {
      return sql(`SELECT subscription, endpoint FROM devices WHERE id = ? AND fingerprint = ? AND calendar_version = ?`,
        job.device, job.fingerprint, calendarVersion).first<DeliveryTarget>();
    },
    async retry(job: ClaimedJob, next: number) {
      await sql(`UPDATE jobs SET pending = 1, ready_at = ?
        WHERE device = ? AND occurrence = ? AND fingerprint = ? AND calendar_version = ? AND attempts = ? AND pending = 0
        AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND fingerprint = ? AND calendar_version = ?)`,
      next, job.device, job.occurrence, job.fingerprint, calendarVersion, job.attempts,
      job.device, job.fingerprint, calendarVersion).run();
    },
    async nextRefill(now: number) {
      return await sql(`SELECT * FROM devices WHERE (calendar_version < ? OR calendar_version > ?)
        AND last_seen >= ? LIMIT 1`, calendarVersion, calendarVersion, now - 365 * day).first<DbDevice>()
        ?? sql(`SELECT * FROM devices WHERE calendar_version = ? AND refill_at <= ? AND last_seen >= ?
          ORDER BY refill_at LIMIT 1`, calendarVersion, now, now - 365 * day).first<DbDevice>();
    },
    async refill(device: DbDevice, horizon: Horizon) {
      await db.batch([
        sql(`UPDATE devices SET refill_at = ?, calendar_version = ?
          WHERE id = ? AND fingerprint = ? AND revision = ? AND refill_at = ? AND calendar_version = ?`,
        horizon.refillAt, calendarVersion, device.id, device.fingerprint, device.revision, device.refill_at, device.calendar_version),
        ...replaceJobs(device.id, device.fingerprint, device.revision, horizon.jobs, device.calendar_version !== calendarVersion),
      ]);
    },
    async cleanup(now: number) {
      await db.batch([
        sql("DELETE FROM revoked WHERE rowid IN (SELECT rowid FROM revoked WHERE expires <= ? LIMIT 200)", now),
        sql("DELETE FROM devices WHERE rowid IN (SELECT rowid FROM devices WHERE last_seen < ? LIMIT 50)", now - 365 * day),
        sql("DELETE FROM jobs WHERE rowid IN (SELECT rowid FROM jobs WHERE expires_at < ? LIMIT 500)", now - 7 * day),
      ]);
    },
  };
}
