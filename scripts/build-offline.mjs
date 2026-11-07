import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const files = [
  "/", "/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
  "/favicon.ico", "/favicon-16.png", "/favicon-32.png", "/favicon-48.png",
];
const assets = await readdir("out/_next/static", { recursive: true, withFileTypes: true });
for (const asset of assets) {
  if (!asset.isFile() || asset.name.endsWith(".map")) continue;
  files.push("/" + join(asset.parentPath, asset.name).replaceAll("\\", "/").replace(/^out\//, ""));
}
files.sort();
const worker = await readFile("scripts/sw.js", "utf8");
const hash = createHash("sha256").update(worker);
for (const file of files) {
  hash.update(file).update(await readFile(file === "/" ? "out/index.html" : "out" + file));
}
const version = hash.digest("hex").slice(0, 16);
await writeFile("out/sw.js", `const VERSION = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(files)};\n${worker}`);
console.log(`PWA ${version}: ${files.length} recursos para uso offline.`);
