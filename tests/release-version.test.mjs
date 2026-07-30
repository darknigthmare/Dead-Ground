import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { APP_VERSION } from "../src/constants.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("la version applicative reste cohérente avec le paquet et la documentation", async () => {
  const [packageSource, readme, changelog, handoff, qaReport, visualDocumentation] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "CHANGELOG.md"), "utf8"),
    readFile(path.join(root, "CODEX_HANDOFF.md"), "utf8"),
    readFile(path.join(root, "QA_REPORT.md"), "utf8"),
    readFile(path.join(root, "docs/OPENAI_VISUALS.md"), "utf8")
  ]);
  const packageData = JSON.parse(packageSource);

  assert.equal(APP_VERSION, packageData.version);
  assert.match(readme, new RegExp(`— ${APP_VERSION.replaceAll(".", "\\.")}$`, "m"));
  assert.match(changelog, new RegExp(`^## ${APP_VERSION.replaceAll(".", "\\.")} `, "m"));
  assert.match(handoff, new RegExp(`Dead Ground ${APP_VERSION.replaceAll(".", "\\.")}`));
  assert.match(qaReport, new RegExp(`Dead Ground ${APP_VERSION.replaceAll(".", "\\.")}`));
  assert.match(visualDocumentation, new RegExp(`Dead Ground ${APP_VERSION.replaceAll(".", "\\.")}`));
});
