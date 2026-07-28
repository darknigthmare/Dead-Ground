import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_SAVE_KEY,
  RESOURCE_META,
  SAVE_KEY
} from "../src/constants.js";
import { GameEngine } from "../src/engine.js";
import { distanceMeters } from "../src/geo.js";
import { migrateState } from "../src/migrations.js";
import {
  GOOGLE_PLACE_COORDINATE_TTL_MS,
  normalizeGooglePlaces
} from "../src/real-places.js";
import {
  loadGame,
  sanitizeForStorage,
  saveGame
} from "../src/storage.js";
import { createInitialState, rollPoiLoot } from "../src/world.js";

const START = Object.freeze({ lat: 43.2965, lng: 5.3698 });
const MAX_SAVE_BYTES = 5 * 1024 * 1024;
const PRIVATE_GOOGLE_NAME = "Nom Google a ne jamais persister";
const PRIVATE_GOOGLE_ADDRESS = "42 rue Google, Marseille";

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

function contaminateGooglePoi(state, {
  placeId = "review-private-place",
  poi = state.pois.find((item) => !item.vehicleWreck)
} = {}) {
  const now = Date.now();
  Object.assign(poi, {
    source: "google-places",
    realPlace: true,
    placeId,
    googleFetchedAt: now - 1_000,
    googleExpiresAt: now + GOOGLE_PLACE_COORDINATE_TTL_MS - 1_000,
    name: PRIVATE_GOOGLE_NAME,
    displayName: PRIVATE_GOOGLE_NAME,
    address: PRIVATE_GOOGLE_ADDRESS,
    formattedAddress: PRIVATE_GOOGLE_ADDRESS,
    primaryType: "pharmacy",
    types: ["pharmacy", "store"],
    googleMapsURI: "https://maps.google.test/private-place"
  });
  state.realPlaceCount = 1;
  state.worldSource = "hybrid-google-places";
  return poi;
}

function assertGoogleDescriptionScrubbed(serialized, placeId) {
  assert.ok(serialized, "la sauvegarde nettoyee doit encore exister");
  const payload = JSON.parse(serialized);
  const poi = payload.pois.find((item) => item.placeId === placeId);
  assert.ok(poi, "le Place ID autorise doit etre conserve");
  assert.doesNotMatch(poi.name, new RegExp(PRIVATE_GOOGLE_NAME));
  for (const field of [
    "address",
    "formattedAddress",
    "displayName",
    "externalId",
    "primaryType",
    "types",
    "googleMapsURI",
    "googleMapsUri"
  ]) {
    assert.equal(field in poi, false, `le champ Google ${field} ne doit pas persister`);
  }
}

test("le type tactique Google reste stable apres normalisation, assainissement et migration", () => {
  const [normalized] = normalizeGooglePlaces([
    {
      id: "pharma-1",
      location: { lat: 43.3002, lng: 5.3712 },
      displayName: "Pharmacie privee",
      formattedAddress: PRIVATE_GOOGLE_ADDRESS,
      primaryType: "pharmacy",
      types: ["pharmacy"]
    }
  ], START);
  assert.ok(normalized);
  const originalType = normalized.type;
  const state = createInitialState({
    start: START,
    difficultyId: "normal",
    seed: 101,
    realPois: [normalized]
  });

  const sanitized = sanitizeForStorage(state);
  const sanitizedPoi = sanitized.pois.find((poi) => poi.placeId === "pharma-1");
  assert.ok(sanitizedPoi);
  assert.equal(sanitizedPoi.type, originalType);

  const migrated = migrateState(sanitized);
  const migratedPoi = migrated.pois.find((poi) => poi.placeId === "pharma-1");
  assert.ok(migratedPoi);
  assert.equal(migratedPoi.type, originalType);
});

test("loadGame nettoie et repersiste une sauvegarde principale v2 deja actuelle", () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const state = createInitialState({ start: START, seed: 202 });
  const placeId = "review-primary-v2";
  contaminateGooglePoi(state, { placeId });
  storage.values.set(SAVE_KEY, JSON.stringify(state));

  const loaded = loadGame();
  assert.ok(loaded);
  assertGoogleDescriptionScrubbed(storage.values.get(SAVE_KEY), placeId);
});

test("loadGame nettoie aussi la sauvegarde secondaire v2 utilisee pour recuperation", () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const state = createInitialState({ start: START, seed: 303 });
  const placeId = "review-backup-v2";
  contaminateGooglePoi(state, { placeId });
  storage.values.set(SAVE_KEY, "{sauvegarde-principale-corrompue");
  storage.values.set(BACKUP_SAVE_KEY, JSON.stringify(state));

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const loaded = loadGame();
    assert.ok(loaded);
  } finally {
    console.warn = originalWarn;
  }
  assertGoogleDescriptionScrubbed(storage.values.get(SAVE_KEY), placeId);
  assertGoogleDescriptionScrubbed(storage.values.get(BACKUP_SAVE_KEY), placeId);
});

test("un POI Google expire reste procedural au deuxieme roundtrip et deplace son epave", () => {
  const state = createInitialState({ start: START, seed: 404 });
  const wreck = state.pois.find((poi) => poi.vehicleWreck);
  assert.ok(wreck);
  const oldWreckPosition = { ...wreck.pos };
  const fetchedAt = Date.now() - GOOGLE_PLACE_COORDINATE_TTL_MS - 60_000;
  Object.assign(wreck, {
    source: "google-places",
    realPlace: true,
    placeId: "review-expired-wreck",
    googleFetchedAt: fetchedAt,
    googleExpiresAt: fetchedAt + GOOGLE_PLACE_COORDINATE_TTL_MS,
    displayName: PRIVATE_GOOGLE_NAME,
    formattedAddress: PRIVATE_GOOGLE_ADDRESS
  });
  Object.assign(state.vehicle, {
    discovered: false,
    repaired: false,
    active: false,
    condition: 0,
    pos: oldWreckPosition,
    parkedAt: "wreck"
  });

  const first = migrateState(state);
  const firstWreck = first.pois.find((poi) => poi.vehicleWreck);
  assert.ok(firstWreck);
  assert.equal(firstWreck.source, "procedural-recovery");
  assert.equal(firstWreck.realPlace, false);
  assert.ok(
    distanceMeters(firstWreck.pos, oldWreckPosition) > 1,
    "les coordonnees Google expirees doivent etre remplacees"
  );
  assert.ok(
    distanceMeters(first.vehicle.pos, firstWreck.pos) < 0.01,
    "vehicle.pos doit suivre la nouvelle position de l'epave"
  );
  assert.equal(first.vehicle.parkedAt, "wreck");

  const second = migrateState(sanitizeForStorage(first));
  const secondWreck = second.pois.find((poi) => poi.vehicleWreck);
  assert.ok(secondWreck);
  assert.equal(secondWreck.source, "procedural-recovery");
  assert.equal(secondWreck.realPlace, false);
  assert.ok(
    distanceMeters(secondWreck.pos, firstWreck.pos) < 0.01,
    "la position procedurale doit rester stable au roundtrip suivant"
  );
  assert.ok(distanceMeters(second.vehicle.pos, secondWreck.pos) < 0.01);
});

test("un vehicule repare est toujours marque comme decouvert lors de la migration", () => {
  const state = createInitialState({ start: START, seed: 505 });
  Object.assign(state.vehicle, {
    discovered: false,
    repaired: true,
    active: false,
    condition: 100
  });

  const migrated = migrateState(state);
  assert.equal(migrated.vehicle.repaired, true);
  assert.equal(migrated.vehicle.discovered, true);
});

test("Number.MAX_VALUE est borne et le moteur peut encore faire progresser le temps", () => {
  const state = createInitialState({ start: START, seed: 606 });
  state.totalMinutes = Number.MAX_VALUE;
  for (const resource of Object.keys(RESOURCE_META)) {
    state.resources[resource] = Number.MAX_VALUE;
  }
  state.zombies = [{
    id: "review-max-health-zombie",
    type: "walker",
    pos: { lat: 43.301, lng: 5.374 },
    health: Number.MAX_VALUE,
    maxHealth: Number.MAX_VALUE,
    attackCooldown: 0,
    screamCooldown: 8,
    target: "base",
    heading: 0,
    wave: false,
    stagger: 0,
    dead: false
  }];

  const migrated = migrateState(state);
  assert.ok(migrated.totalMinutes <= Number.MAX_SAFE_INTEGER);
  for (const amount of Object.values(migrated.resources)) {
    assert.ok(amount <= Number.MAX_SAFE_INTEGER);
  }
  assert.equal(migrated.zombies.length, 1);
  assert.ok(migrated.zombies[0].health <= Number.MAX_SAFE_INTEGER);
  assert.ok(migrated.zombies[0].maxHealth <= Number.MAX_SAFE_INTEGER);

  migrated.status = "playing";
  migrated.paused = false;
  migrated.tutorialVisible = false;
  migrated.autoFire = false;
  migrated.timers.ambientSpawn = 1_000_000;
  migrated.timers.nestSpawn = 1_000_000;
  migrated.weather.remainingMinutes = 1_000_000;
  const engine = new GameEngine(migrated);
  const beforeStep = migrated.totalMinutes;
  engine.step(0.25);
  assert.ok(
    migrated.totalMinutes > beforeStep,
    "un pas moteur valide doit encore avancer l'horloge apres migration"
  );
});

test("saveGame ne persiste jamais un payload superieur a 5 Mo", () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const state = createInitialState({ start: START, seed: 707 });
  state.logs = Array.from({ length: 9_000 }, (_, index) => ({
    id: `review-large-log-${index}`,
    totalMinutes: state.totalMinutes,
    category: "system",
    text: "x".repeat(700)
  }));

  const originalWarn = console.warn;
  console.warn = () => {};
  let saved;
  try {
    saved = saveGame(state);
  } finally {
    console.warn = originalWarn;
  }
  const serialized = storage.values.get(SAVE_KEY);
  const byteLength = serialized ? new TextEncoder().encode(serialized).byteLength : 0;
  assert.ok(
    serialized === undefined || byteLength <= MAX_SAVE_BYTES,
    "la sauvegarde locale doit etre refusee ou elaguee avant ecriture"
  );
  assert.equal(saved, serialized !== undefined);
});

test("le bonus de fouille du fourgon reste applique apres son stationnement", () => {
  const state = createInitialState({ start: START, seed: 808 });
  for (const survivor of state.base.roster) survivor.role = "idle";
  const poi = state.pois.find((candidate) => {
    if (
      candidate.looted ||
      candidate.nest?.active ||
      candidate.campaignSignalPart ||
      candidate.vehicleWreck ||
      state.missions.active.some((mission) => mission.poiId === candidate.id)
    ) {
      return false;
    }
    const regular = rollPoiLoot(candidate, state.difficultyId, 1);
    const supported = rollPoiLoot(candidate, state.difficultyId, 1.15);
    return JSON.stringify(regular) !== JSON.stringify(supported);
  });
  assert.ok(poi, "le monde de test doit proposer une fouille sensible au bonus");

  state.selectedPoiId = poi.id;
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  Object.assign(state.vehicle, {
    discovered: true,
    repaired: true,
    active: true,
    condition: 100,
    pos: { ...poi.pos },
    parkedAt: "mobile"
  });
  poi.defendersSpawned = { scavenge: true, clearNest: false };
  const expectedLoot = rollPoiLoot(poi, state.difficultyId, 1.15);
  const before = { ...state.resources };
  const engine = new GameEngine(state);

  assert.equal(engine.beginScavenge(), true);
  assert.equal(state.vehicle.active, false);
  assert.ok(distanceMeters(state.vehicle.pos, state.player.pos) < 0.01);
  state.activity.elapsed = state.activity.duration;
  engine.updateActivity(0);
  assert.equal(state.activity, null);

  for (const resource of Object.keys(RESOURCE_META)) {
    assert.equal(
      state.resources[resource] - before[resource],
      expectedLoot[resource] ?? 0,
      `le gain ${resource} doit inclure le bonus du vehicule stationne`
    );
  }
});
