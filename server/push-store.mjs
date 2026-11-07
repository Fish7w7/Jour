import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const dayMs = 86_400_000;
export const hash = (value) => createHash("sha256").update(value).digest("hex");

export function openPushStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, subscription TEXT NOT NULL,
      plan TEXT NOT NULL, revision INTEGER NOT NULL, active_since INTEGER NOT NULL,
      last_seen INTEGER NOT NULL, last_test INTEGER
    );
    CREATE TABLE IF NOT EXISTS revoked (
      id TEXT PRIMARY KEY, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      device TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      occurrence TEXT NOT NULL, claimed INTEGER NOT NULL,
      PRIMARY KEY (device, occurrence)
    );
  `);
  const get = db.prepare("SELECT * FROM devices WHERE id = ?");
  const owner = db.prepare("SELECT id FROM devices WHERE endpoint = ?");
  const revoked = db.prepare("SELECT 1 FROM revoked WHERE id = ? AND expires > ?");
  const save = db.prepare(`
    INSERT INTO devices (id, endpoint, subscription, plan, revision, active_since, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, subscription = excluded.subscription,
      plan = excluded.plan, revision = excluded.revision, active_since = excluded.active_since,
      last_seen = excluded.last_seen
  `);
  const remove = db.prepare("DELETE FROM devices WHERE id = ?");
  const forget = db.prepare("INSERT OR REPLACE INTO revoked VALUES (?, ?)");
  const claim = db.prepare("INSERT OR IGNORE INTO deliveries VALUES (?, ?, ?)");
  const lastTest = db.prepare("UPDATE devices SET last_test = ? WHERE id = ? AND (last_test IS NULL OR last_test <= ?)");
  const list = db.prepare("SELECT id FROM devices");
  const count = db.prepare("SELECT COUNT(*) AS total FROM devices");
  const cleanRevoked = db.prepare("DELETE FROM revoked WHERE expires <= ?");
  const cleanDevices = db.prepare("DELETE FROM devices WHERE last_seen < ?");
  const cleanDeliveries = db.prepare("DELETE FROM deliveries WHERE claimed < ?");

  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    get: (id) => get.get(id),
    ids: () => list.all().map(({ id }) => id),
    save(id, subscription, plan, revision, now) {
      return transaction(() => {
        if (revoked.get(id, now)) return 410;
        const current = get.get(id);
        const existing = owner.get(subscription.endpoint);
        if (existing && existing.id !== id) return 409;
        if (current && current.revision > revision) return 409;
        if (!current && count.get().total >= 2000) return 503;
        const encodedPlan = JSON.stringify(plan);
        const encodedSubscription = JSON.stringify(subscription);
        if (current && current.revision === revision && current.plan !== encodedPlan) return 409;
        const unchanged = current && current.plan === encodedPlan && current.subscription === encodedSubscription;
        save.run(id, subscription.endpoint, encodedSubscription, encodedPlan, revision, unchanged ? current.active_since : now, now);
        return 204;
      });
    },
    revoke(id, now, expectedEndpoint) {
      return transaction(() => {
        if (expectedEndpoint && get.get(id)?.endpoint !== expectedEndpoint) return;
        remove.run(id);
        forget.run(id, now + 7 * dayMs);
      });
    },
    claim: (id, occurrence, now) => claim.run(id, occurrence, now).changes === 1,
    reserveTest: (id, now) => lastTest.run(now, id, now - 60_000).changes === 1,
    cleanup(now) {
      cleanRevoked.run(now);
      cleanDevices.run(now - 365 * dayMs);
      cleanDeliveries.run(now - 7 * dayMs);
    },
    close: () => db.close(),
  };
}
