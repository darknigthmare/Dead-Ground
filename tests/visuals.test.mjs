import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  portraitForSurvivor,
  VISUAL_ASSETS,
  VISUAL_ASSET_PATHS
} from "../src/visuals.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("le registre référence exactement les onze visuels livrés", async () => {
  assert.equal(VISUAL_ASSET_PATHS.length, 11);
  assert.equal(new Set(VISUAL_ASSET_PATHS).size, VISUAL_ASSET_PATHS.length);
  assert.equal(VISUAL_ASSETS.survivors.length, 6);

  for (const assetPath of VISUAL_ASSET_PATHS) {
    assert.match(assetPath, /^\.\/src\/assets\/visuals\/[\w-]+\.webp$/);
    const asset = await stat(path.join(root, assetPath.slice(2)));
    assert.equal(asset.isFile(), true);
    assert.ok(asset.size > 1_000, `${assetPath} paraît vide`);
    assert.ok(asset.size < 200_000, `${assetPath} est trop lourd pour le shell PWA`);
  }
});

test("le portrait d’un survivant est stable et reste hors sauvegarde", () => {
  const ids = Array.from({ length: 40 }, (_, index) => `survivor-${index}`);
  const firstPass = ids.map(portraitForSurvivor);
  const secondPass = ids.map(portraitForSurvivor);

  assert.deepEqual(secondPass, firstPass);
  assert.ok(firstPass.every((portrait) => VISUAL_ASSETS.survivors.includes(portrait)));
  assert.ok(new Set(firstPass).size >= 5);
});
