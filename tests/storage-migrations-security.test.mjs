import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_SAVE_KEY,
  SAVE_KEY
} from "../src/constants.js";
import { GameEngine } from "../src/engine.js";
import { distanceMeters } from "../src/geo.js";
import {
  migrateState,
  validateMigratedState
} from "../src/migrations.js";
import { GOOGLE_PLACE_COORDINATE_TTL_MS } from "../src/real-places.js";
import {
  importSave,
  loadGame,
  sanitizeForStorage
} from "../src/storage.js";
import { createInitialState } from "../src/world.js";

const START = Object.freeze({ lat: 43.2965, lng: 5.3698 });
const GOOGLE_NAME = "Nom Google privé de régression";
const GOOGLE_ADDRESS = "99 rue Google privée, Marseille";

function makeStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    }
  };
}

function contaminateGooglePoi(state, poi, {
  placeId = "security-storage-place",
  fetchedAt = Date.now() - 1_000,
  expiresAt = Date.now() + 86_400_000
} = {}) {
  Object.assign(poi, {
    source: "google-places",
    realPlace: true,
    placeId,
    googleFetchedAt: fetchedAt,
    googleExpiresAt: expiresAt,
    name: GOOGLE_NAME,
    displayName: { text: GOOGLE_NAME },
    address: GOOGLE_ADDRESS,
    formattedAddress: GOOGLE_ADDRESS
  });
}

function addGoogleDescriptionsToMissionAndLog(state, poi) {
  const mission = state.missions.active.find((entry) => entry.poiId === poi.id);
  assert.ok(mission, "le POI de test doit être lié à une mission");
  mission.title = `Mission vers ${GOOGLE_NAME}`;
  mission.description = `Rejoignez ${GOOGLE_ADDRESS}`;
  state.logs.unshift({
    id: "google-description-log",
    totalMinutes: state.totalMinutes,
    category: "loot",
    text: `${GOOGLE_NAME} fouillé à ${GOOGLE_ADDRESS}`
  });
}

function assertNoGoogleDescriptions(payload) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, new RegExp(GOOGLE_NAME, "u"));
  assert.doesNotMatch(serialized, new RegExp(GOOGLE_ADDRESS, "u"));
}

test("des coordonnées nulles ou vides font utiliser la sauvegarde secondaire valide", () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const corrupt = createInitialState({ start: START, seed: 10 });
  corrupt.base.pos = { lat: null, lng: null };
  corrupt.player.pos = { lat: " ", lng: "" };
  const backup = createInitialState({
    start: { lat: 48.8566, lng: 2.3522 },
    seed: 20
  });
  storage.values.set(SAVE_KEY, JSON.stringify(corrupt));
  storage.values.set(BACKUP_SAVE_KEY, JSON.stringify(backup));

  const loaded = loadGame();

  assert.ok(loaded);
  assert.equal(loaded.seed, backup.seed);
  assert.deepEqual(loaded.base.pos, backup.base.pos);
  assert.equal(migrateState(corrupt), null);
});

test("migration et assainissement direct retirent les descriptions Google des missions et journaux", () => {
  const state = createInitialState({ start: START, seed: 101 });
  const mission = state.missions.active[0];
  const poi = state.pois.find((entry) => entry.id === mission.poiId);
  assert.ok(poi);
  contaminateGooglePoi(state, poi);
  addGoogleDescriptionsToMissionAndLog(state, poi);

  const migrated = migrateState(state);
  const sanitized = sanitizeForStorage(state);

  assert.ok(migrated);
  assertNoGoogleDescriptions(migrated);
  assertNoGoogleDescriptions(sanitized);
});

test("un lieu Google legacy sans TTL expire depuis createdAt et non updatedAt", () => {
  const state = createInitialState({ start: START, seed: 202 });
  const poi = state.pois[0];
  const oldPosition = { ...poi.pos };
  contaminateGooglePoi(state, poi, { placeId: "legacy-no-ttl" });
  delete poi.googleFetchedAt;
  delete poi.googleExpiresAt;
  state.createdAt = Date.now() - 45 * 86_400_000;
  state.updatedAt = Date.now();

  const migrated = migrateState(state);
  const sanitized = sanitizeForStorage(state);
  const migratedPoi = migrated.pois.find((entry) => entry.id === poi.id);
  const sanitizedPoi = sanitized.pois.find((entry) => entry.id === poi.id);

  for (const entry of [migratedPoi, sanitizedPoi]) {
    assert.equal(entry.realPlace, false);
    assert.equal(entry.source, "procedural-recovery");
    assert.ok(distanceMeters(entry.pos, oldPosition) > 1);
  }
});

test("l'expiration Google relocalise joueur, véhicule et zombie à la coordonnée exacte", () => {
  const state = createInitialState({ start: START, seed: 303 });
  const poi = state.pois.find((entry) => !entry.vehicleWreck);
  const oldPosition = { ...poi.pos };
  const fetchedAt = Date.now() - GOOGLE_PLACE_COORDINATE_TTL_MS - 60_000;
  contaminateGooglePoi(state, poi, {
    placeId: "expired-dependent-position",
    fetchedAt,
    expiresAt: fetchedAt + GOOGLE_PLACE_COORDINATE_TTL_MS
  });
  Object.assign(state.player, { pos: { ...oldPosition }, atBase: false });
  Object.assign(state.vehicle, {
    discovered: true,
    repaired: true,
    active: false,
    condition: 100,
    pos: { ...oldPosition },
    parkedAt: poi.id
  });
  state.zombies = [{
    id: "expired-position-zombie",
    type: "walker",
    pos: { ...oldPosition },
    health: 44,
    maxHealth: 44,
    attackCooldown: 0,
    screamCooldown: 8,
    target: "player",
    heading: 0,
    wave: false,
    stagger: 0,
    dead: false
  }];

  for (const payload of [migrateState(state), sanitizeForStorage(state)]) {
    const relocatedPoi = payload.pois.find((entry) => entry.id === poi.id);
    assert.ok(distanceMeters(relocatedPoi.pos, oldPosition) > 1);
    assert.ok(distanceMeters(payload.player.pos, relocatedPoi.pos) < 0.01);
    assert.ok(distanceMeters(payload.vehicle.pos, relocatedPoi.pos) < 0.01);
    assert.ok(distanceMeters(payload.zombies[0].pos, relocatedPoi.pos) < 0.01);
  }
});

test("les vagues et timers énormes sont bornés avant moteur et stockage", () => {
  const state = createInitialState({ start: START, seed: 404 });
  state.totalMinutes = 21 * 60;
  state.tutorialVisible = false;
  state.base.structures.generator = 1;
  state.resources.fuel = 1_000_000_000;
  Object.assign(state.wave, {
    active: false,
    number: Number.MAX_VALUE,
    queued: Number.MAX_VALUE,
    total: Number.MAX_VALUE,
    spawned: Number.MAX_VALUE,
    defeated: Number.MAX_VALUE,
    nextSpawnIn: Number.MAX_VALUE,
    announcedDay: Number.MAX_VALUE,
    bossQueued: Number.MAX_VALUE
  });
  Object.assign(state.timers, {
    ambientSpawn: Number.MAX_VALUE,
    nestSpawn: Number.MAX_VALUE,
    generatorFuelPulse: Number.MAX_VALUE
  });

  const migrated = migrateState(state);
  const sanitized = sanitizeForStorage(state);

  assert.equal(validateMigratedState(migrated), true);
  for (const payload of [migrated, sanitized]) {
    assert.ok(payload.wave.number < 1_000_000);
    assert.ok(payload.wave.queued <= 500);
    assert.ok(payload.wave.total <= 500);
    assert.ok(payload.wave.nextSpawnIn <= 120);
    assert.ok(payload.timers.ambientSpawn <= 300);
    assert.ok(payload.timers.nestSpawn <= 300);
    assert.ok(payload.timers.generatorFuelPulse <= 180);
    assertNoGoogleDescriptions(payload);
    assert.equal(Number.isFinite(payload.wave.number), true);
    assert.equal(Number.isFinite(payload.timers.generatorFuelPulse), true);
    assert.ok(Object.values(payload.resources).every(Number.isFinite));
  }

  migrated.paused = false;
  migrated.status = "playing";
  const fuelBefore = migrated.resources.fuel;
  const engine = new GameEngine(migrated);
  engine.step(0.01);
  assert.ok(
    fuelBefore - migrated.resources.fuel <= 1,
    "le générateur ne doit plus vider un milliard d'unités en une frame"
  );

  migrated.wave.active = true;
  migrated.wave.queued = 0;
  migrated.wave.spawned = 0;
  migrated.wave.total = 0;
  migrated.zombies = [];
  engine.step(0.01);
  assert.equal(Number.isFinite(migrated.score), true);
  assert.ok(Object.values(migrated.resources).every(Number.isFinite));
});

test("l'import écrit une backup nettoyée plutôt que la sauvegarde brute", async () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const previous = createInitialState({ start: START, seed: 505 });
  const mission = previous.missions.active[0];
  const poi = previous.pois.find((entry) => entry.id === mission.poiId);
  contaminateGooglePoi(previous, poi, { placeId: "import-backup-place" });
  addGoogleDescriptionsToMissionAndLog(previous, poi);
  storage.values.set(SAVE_KEY, JSON.stringify(previous));

  const incoming = createInitialState({
    start: { lat: 45.764, lng: 4.8357 },
    seed: 606
  });
  const text = JSON.stringify(incoming);
  await importSave({
    size: new TextEncoder().encode(text).byteLength,
    text: async () => text
  });

  const backup = storage.values.get(BACKUP_SAVE_KEY);
  assert.ok(backup);
  assertNoGoogleDescriptions(JSON.parse(backup));
});

test("la catégorie craft reste intacte au rechargement", () => {
  const state = createInitialState({ start: START, seed: 707 });
  state.logs.unshift({
    id: "craft-log",
    totalMinutes: state.totalMinutes,
    category: "craft",
    text: "Objet fabriqué"
  });

  const migrated = migrateState(state);

  assert.equal(
    migrated.logs.find((entry) => entry.id === "craft-log")?.category,
    "craft"
  );
});
