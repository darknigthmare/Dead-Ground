import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectories = ["src", "scripts", "tests"];
const supportedExtensions = new Set([".js", ".mjs"]);

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(absolute));
    } else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }

  return files;
}

const files = (
  await Promise.all(sourceDirectories.map((directory) => listJavaScriptFiles(path.join(root, directory))))
).flat().sort((left, right) => left.localeCompare(right, "en"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Syntaxe JavaScript invalide : ${path.relative(root, file)}`);
  }
}

console.log(`Syntaxe JavaScript validée : ${files.length} fichiers.`);
