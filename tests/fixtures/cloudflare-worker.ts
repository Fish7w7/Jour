import { createWorker, type Env } from "../../worker/index.ts";

// Public P-256 test vectors. This entry point never calls a Web Push provider.
const scalar1 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE";
const encode = (hex: string) => btoa(String.fromCharCode(...hex.match(/../g)!.map((byte) => parseInt(byte, 16))))
  .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fixtureEnv = (env: Env, origin = "http://127.0.0.1") => ({
  ...env, APP_ORIGIN: origin, VAPID_SUBJECT: "mailto:fixture@example.com", VAPID_PRIVATE_KEY: scalar1,
  VAPID_PUBLIC_KEY: encode("046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"),
});

function worker(env: Env, time: number) {
  const provider: typeof fetch = async (input, init) => {
    // Exercise the same RequestInit validation as the real Workers fetch.
    const request = new Request(input, init);
    if (request.redirect !== "manual") throw new Error("Push requests must not follow redirects.");
    const endpoint = request.url;
    const { headers } = request;
    const topic = headers.get("Topic");
    const path = new URL(endpoint).pathname;
    const previous = await env.DB.prepare("SELECT COUNT(*) FROM fixture_attempts WHERE endpoint = ? AND topic = ?")
      .bind(endpoint, topic).first<number>("COUNT(*)");
    const status = path === "/retry" && previous === 0 ? 429 : path === "/retry" && previous === 1 ? 503
      : path === "/gone" ? 410 : path === "/ambiguous" ? 0 : path === "/redirect" ? 307 : 201;
    const bytes = new Uint8Array(await request.arrayBuffer());
    await env.DB.prepare("INSERT INTO fixture_attempts VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(endpoint, topic, status, headers.get("Authorization"), headers.get("Content-Encoding"),
        headers.get("TTL"), btoa(String.fromCharCode(...bytes))).run();
    if (status === 0) throw new Error("simulated timeout");
    if (status === 307) return Response.redirect("https://redirect.example/", 307);
    return new Response(null, { status, headers: status === 429 || status === 503 ? { "Retry-After": "120" } : undefined });
  };
  return createWorker({ provider, clock: () => time });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/push/fixture/init") {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fixture_attempts
        (endpoint TEXT, topic TEXT, status INTEGER, authorization TEXT, encoding TEXT, ttl TEXT, ciphertext TEXT)`).run();
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/api/push/fixture/state") {
      const [attempts, jobs, devices] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM fixture_attempts ORDER BY rowid"),
        env.DB.prepare("SELECT occurrence, ready_at, pending, attempts, calendar_version FROM jobs ORDER BY ready_at"),
        env.DB.prepare("SELECT id, revision, refill_at, calendar_version FROM devices"),
      ]);
      return Response.json({ attempts: attempts.results, jobs: jobs.results, devices: devices.results });
    }
    if (url.pathname === "/api/push/fixture/obsolete") {
      await env.DB.prepare("UPDATE devices SET calendar_version = 'old'").run();
      await env.DB.prepare("UPDATE jobs SET calendar_version = 'old'").run();
      return new Response(null, { status: 204 });
    }
    return worker(env, Number(request.headers.get("X-Fixture-Time")) || 0).fetch(request, fixtureEnv(env, url.origin));
  },
  async scheduled(controller: Parameters<ReturnType<typeof createWorker>["scheduled"]>[0], env: Env) {
    return worker(env, controller.scheduledTime).scheduled(controller, fixtureEnv(env));
  },
};
