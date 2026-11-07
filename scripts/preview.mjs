import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { startPushService } from "../server/start-push.mjs";

const root = resolve("out");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json",
};

await stat(resolve(root, "index.html")).catch(() => {
  console.error("Execute npm run build primeiro.");
  process.exit(1);
});
const push = startPushService();

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.startsWith("/api/push/")) {
      if (push) {
        try { return await push.handle(request, response, pathname); }
        catch {
          console.error("Falha na API de notificações.");
          response.setHeader("Cache-Control", "no-store");
          return response.writeHead(500).end();
        }
      }
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json");
      return response.writeHead(503).end(JSON.stringify({ available: false }));
    }
    if (request.method !== "GET" && request.method !== "HEAD") return response.writeHead(405).end();
    const file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error("Arquivo inexistente");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.setHeader("Cache-Control", "no-cache");
    if (request.method === "HEAD") return response.end();
    createReadStream(file).on("error", () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end("Arquivo inexistente.");
  }
}).listen(port, host, () => console.log(`Jour em http://${host}:${port} · Web Push ${push ? "ativo" : "desativado"}`));
