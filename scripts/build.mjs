import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const workerPlaceholder = "__DEAD_GROUND_BUILD_VERSION__";
const appFiles = [
  "index.html",
  "legal.css",
  "privacy.html",
  "styles.css",
  "terms.html",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png"
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const relativePath of appFiles) {
  await cp(path.join(root, relativePath), path.join(dist, relativePath));
}

const packageData = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const rawBuildVersion = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  packageData.version ||
  "dev"
).trim();
const buildVersion = rawBuildVersion
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .slice(0, 64) || "dev";
const workerTemplate = await readFile(path.join(root, "service-worker.js"), "utf8");
if (!workerTemplate.includes(workerPlaceholder)) {
  throw new Error(`Placeholder PWA absent du service worker : ${workerPlaceholder}`);
}
await writeFile(
  path.join(dist, "service-worker.js"),
  workerTemplate.replaceAll(workerPlaceholder, buildVersion),
  "utf8"
);

await cp(path.join(root, "src"), path.join(dist, "src"), {
  recursive: true,
  filter: (source) => !/\.(?:tmp|bak|orig|d\.ts)$|~$/i.test(source)
});

let sourceConfig = "";
try {
  sourceConfig = await readFile(path.join(root, "config.local.js"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const localKey = sourceConfig.match(/googleMapsApiKey\s*:\s*["']([^"']*)["']/)?.[1]?.trim() ?? "";
const googleMapsApiKey = (
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.PUBLIC_GOOGLE_MAPS_API_KEY ||
  localKey
).trim();

const generatedConfig = `/** Généré par npm run build. Ne pas stocker une clé non restreinte ici. */\nwindow.DEAD_GROUND_CONFIG = {\n  googleMapsApiKey: ${JSON.stringify(googleMapsApiKey)}\n};\n`;
await writeFile(path.join(dist, "config.local.js"), generatedConfig, "utf8");

console.log(`Build créé dans ${path.relative(root, dist)}/ (cache ${buildVersion}, ${googleMapsApiKey ? "clé Google Maps injectée" : "mode procédural par défaut"}).`);
