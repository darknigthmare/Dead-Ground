import test from "node:test";
import assert from "node:assert/strict";

import { loadGoogleMaps, resetGoogleMapsLoader } from "../src/maps/google-map.js";

test("un changement de clé ne réutilise pas silencieusement une API Google déjà chargée", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let scriptRemoved = false;

  globalThis.window = {
    google: { maps: {} },
    location: { reload() {} }
  };
  globalThis.document = {
    getElementById(id) {
      assert.equal(id, "dead-ground-google-maps");
      return { remove: () => { scriptRemoved = true; } };
    }
  };

  try {
    const result = resetGoogleMapsLoader();
    assert.equal(scriptRemoved, true);
    assert.equal(result.requiresReload, true);
    assert.equal(result.reloading, false);
    await assert.rejects(
      loadGoogleMaps("nouvelle-clé"),
      (error) => error?.code === "GOOGLE_MAPS_RELOAD_REQUIRED"
    );
  } finally {
    globalThis.window = { location: { reload() {} } };
    globalThis.document = { getElementById: () => null };
    resetGoogleMapsLoader();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("le reset peut demander explicitement un rechargement contrôlé", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let reloads = 0;

  globalThis.window = {
    google: { maps: {} },
    location: { reload: () => { reloads += 1; } }
  };
  globalThis.document = { getElementById: () => null };

  try {
    const result = resetGoogleMapsLoader({ reloadIfLoaded: true });
    assert.deepEqual(result, { requiresReload: true, reloading: true });
    assert.equal(reloads, 1);
  } finally {
    globalThis.window = { location: { reload() {} } };
    resetGoogleMapsLoader();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
