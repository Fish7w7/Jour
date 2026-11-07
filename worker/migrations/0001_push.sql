CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  subscription TEXT NOT NULL,
  plan TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  calendar_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  active_since INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  refill_at INTEGER NOT NULL,
  last_test INTEGER
);
CREATE INDEX devices_refill ON devices (calendar_version, refill_at);
CREATE INDEX devices_seen ON devices (last_seen);

CREATE TABLE revoked (
  id TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
CREATE INDEX revoked_expiry ON revoked (expires);

CREATE TABLE jobs (
  device TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  occurrence TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  calendar_version TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (device, occurrence)
);
CREATE INDEX jobs_due ON jobs (calendar_version, ready_at) WHERE pending = 1;
CREATE INDEX jobs_expiry ON jobs (expires_at);
