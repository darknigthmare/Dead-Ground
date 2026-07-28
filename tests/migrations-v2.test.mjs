import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_SAVE_KEY, GAME_VERSION, SAVE_KEY } from "../src/constants.js";
import { migrateState, validateMigratedState } from "../src/migrations.js";
import { loadGame, saveGame } from "../src/storage.js";
import { createInitialState } from "../src/world.js";

const START = { lat: 43.2965, lng: 5.3698 };

function makeStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

test("une sauvegarde 1.x est enrichie sans perdre la base, le joueur ni les lieux", () => {
  const legacy = createInitialState({ start: START, seed: 222 });
  legacy.version = 1;
  delete legacy.inventory;
  delete legacy.research;
  delete legacy.vehicle;
  delete legacy.weather;
  delete legacy.campaign;
  delete legacy.missions;
  delete legacy.base.roster;
  for (const poi of legacy.pois) {
    delete poi.nest;
    delete poi.outpost;
    delete poi.campaignSignalPart;
    delete poi.vehicleWreck;
    delete poi.missionMarker;
  }

  const migrated = migrateState(legacy);
  assert.equal(validateMigratedState(migrated), true);
  assert.equal(migrated.version, GAME_VERSION);
  assert.deepEqual(migrated.base.pos, START);
  assert.ok(migrated.base.roster.length >= 1);
  assert.deepEqual(Object.keys(migrated.inventory).sort(), ["antidote", "fieldKit", "repairKit", "trap"]);
  assert.ok(Array.isArray(migrated.research.unlocked));
  assert.ok(migrated.pois.some((poi) => poi.nest.active));
  assert.ok(migrated.pois.some((poi) => poi.campaignSignalPart));
  assert.ok(migrated.pois.some((poi) => poi.vehicleWreck));
});

test("la sauvegarde secondaire récupère automatiquement une sauvegarde principale corrompue", () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const state = createInitialState({ start: START, seed: 333 });
  state.score = 120;
  assert.equal(saveGame(state), true);
  state.score = 980;
  assert.equal(saveGame(state), true);
  assert.ok(storage.values.has(BACKUP_SAVE_KEY));
  storage.values.set(SAVE_KEY, "{JSON-CORROMPU");

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const recovered = loadGame();
    assert.ok(recovered);
    assert.equal(recovered.score, 120);
    assert.equal(recovered.version, GAME_VERSION);
  } finally {
    console.warn = originalWarn;
  }
});

test("la migration conserve la sauvegarde 1.x originale dans la copie de secours", () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const legacy = createInitialState({ start: START, seed: 444 });
  legacy.version = 1;
  legacy.score = 654;
  const legacyRaw = JSON.stringify(legacy);
  storage.values.set("dead-ground-save-v1", legacyRaw);

  const migrated = loadGame();
  assert.ok(migrated);
  assert.equal(migrated.version, GAME_VERSION);
  assert.equal(migrated.score, 654);
  assert.equal(storage.values.get(BACKUP_SAVE_KEY), legacyRaw);
  assert.equal(JSON.parse(storage.values.get(SAVE_KEY)).version, GAME_VERSION);
});
