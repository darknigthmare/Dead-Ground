import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const workerPlaceholder = "__DEAD_GROUND_BUILD_VERSION__";

function normalizeBuildVersion(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 64) || "dev";
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, relative));
    else files.push(relative);
  }
  return files;
}

const required = [
  "index.html",
  "legal.css",
  "privacy.html",
  "styles.css",
  "terms.html",
  "config.local.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "service-worker.js",
  "src/main.js",
  "src/constants.js",
  "src/geo.js",
  "src/rng.js",
  "src/world.js",
  "src/real-places.js",
  "src/engine.js",
  "src/storage.js",
  "src/migrations.js",
  "src/audio.js",
  "src/renderer.js",
  "src/ui.js",
  "src/visuals.js",
  "src/assets/visuals/menu-sector-fall.webp",
  "src/assets/visuals/missions-radio-desk.webp",
  "src/assets/visuals/survivor-01.webp",
  "src/assets/visuals/survivor-02.webp",
  "src/assets/visuals/survivor-03.webp",
  "src/assets/visuals/survivor-04.webp",
  "src/assets/visuals/survivor-05.webp",
  "src/assets/visuals/survivor-06.webp",
  "src/assets/visuals/vehicle-expedition-top.webp",
  "src/assets/visuals/ending-zone-fallen.webp",
  "src/assets/visuals/ending-convoy-evacuation.webp",
  "src/maps/google-map.js",
  "src/maps/fallback-map.js"
];

for (const relativePath of required) {
  await access(path.join(dist, relativePath), fsConstants.R_OK);
}

const moduleFiles = required.filter((item) => item.endsWith(".js") && item.startsWith("src/"));
const importPattern = /(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g;
for (const relativePath of moduleFiles) {
  const absolutePath = path.join(dist, relativePath);
  const source = await readFile(absolutePath, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const target = path.resolve(path.dirname(absolutePath), match[1]);
    await access(target, fsConstants.R_OK);
  }
}

const distFiles = await listFiles(dist);
const temporaryFiles = distFiles.filter((file) => /\.(?:tmp|bak|orig|d\.ts)$|~$/i.test(file));
if (temporaryFiles.length > 0) {
  throw new Error(`Fichiers temporaires présents dans dist : ${temporaryFiles.join(", ")}`);
}

const worker = await readFile(path.join(dist, "service-worker.js"), "utf8");
const packageData = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const expectedBuildVersion = normalizeBuildVersion(
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  packageData.version ||
  "dev"
);
const injectedBuildVersion = worker.match(/^const BUILD_VERSION = "([^"]+)";$/m)?.[1];
if (worker.includes(workerPlaceholder) || injectedBuildVersion !== expectedBuildVersion) {
  throw new Error(`Version PWA incorrecte : attendu ${expectedBuildVersion}, reçu ${injectedBuildVersion ?? "aucune"}.`);
}
for (const strategyMarker of [
  'event.request.mode === "navigate"',
  'requestUrl.pathname.endsWith("/config.local.js")',
  "event.waitUntil(revalidation"
]) {
  if (!worker.includes(strategyMarker)) {
    throw new Error(`Stratégie PWA absente du build : ${strategyMarker}`);
  }
}
const shellExpected = required.filter((item) => item !== "service-worker.js");
for (const relativePath of shellExpected) {
  const shellPath = `./${relativePath}`;
  if (!worker.includes(`"${shellPath}"`)) {
    throw new Error(`Le service worker ne référence pas ${shellPath}.`);
  }
}

const html = await readFile(path.join(dist, "index.html"), "utf8");
for (const reference of [
  "./styles.css",
  "./config.local.js",
  "./src/main.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png"
]) {
  if (!html.includes(reference)) throw new Error(`Référence HTML absente : ${reference}`);
}

const runtimeConfig = await readFile(path.join(dist, "config.local.js"), "utf8");
if (!runtimeConfig.includes("window.DEAD_GROUND_CONFIG")) {
  throw new Error("Configuration navigateur générée invalide.");
}

const manifest = JSON.parse(await readFile(path.join(dist, "manifest.webmanifest"), "utf8"));
for (const icon of ["./icon-192.png", "./icon-512.png", "./icon.svg"]) {
  if (!manifest.icons?.some((entry) => entry.src === icon)) {
    throw new Error(`Icône PWA absente du manifeste : ${icon}`);
  }
}

console.log(`Validation statique réussie : ${required.length} fichiers, imports ES et shell PWA ${injectedBuildVersion} cohérents.`);
