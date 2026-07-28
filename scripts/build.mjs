import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const appFiles = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "service-worker.js"
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const relativePath of appFiles) {
  await cp(path.join(root, relativePath), path.join(dist, relativePath));
}
await cp(path.join(root, "src"), path.join(dist, "src"), {
  recursive: true,
  filter: (source) => !/\.(?:tmp|bak|orig|d\.ts)$|~$/i.test(source)
});

const sourceConfig = await readFile(path.join(root, "config.local.js"), "utf8");
const localKey = sourceConfig.match(/googleMapsApiKey\s*:\s*["']([^"']*)["']/)?.[1]?.trim() ?? "";
const googleMapsApiKey = (
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.PUBLIC_GOOGLE_MAPS_API_KEY ||
  localKey
).trim();

const generatedConfig = `/** Généré par npm run build. Ne pas stocker une clé non restreinte ici. */\nwindow.DEAD_GROUND_CONFIG = {\n  googleMapsApiKey: ${JSON.stringify(googleMapsApiKey)}\n};\n`;
await writeFile(path.join(dist, "config.local.js"), generatedConfig, "utf8");

console.log(`Build créé dans ${path.relative(root, dist)}/ (${googleMapsApiKey ? "clé Google Maps injectée" : "mode procédural par défaut"}).`);
