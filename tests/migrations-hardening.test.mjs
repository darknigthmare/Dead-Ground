import test from "node:test";
import assert from "node:assert/strict";

import { GameEngine } from "../src/engine.js";
import { migrateState, validateMigratedState } from "../src/migrations.js";
import { sanitizeForStorage } from "../src/storage.js";
import { createInitialState } from "../src/world.js";

const START = { lat: 43.2965, lng: 5.3698 };
const SAFE_ID = /^[a-zA-Z0-9_-]{1,96}$/;

test("durcit les identifiants, plages, journaux et collections importés", () => {
  const raw = createInitialState({ start: START, seed: 73 });
  const injectedId = `"><img src=x onerror=alert(1)>`;
  raw.pois[0].id = injectedId;
  raw.pois[0].danger = 999;
  raw.pois[1].id = injectedId;
  raw.base.roster[0].id = injectedId;
  raw.base.roster[1].id = injectedId;
  raw.logs = [
    null,
    {
      id: injectedId,
      totalMinutes: "jamais",
      category: injectedId,
      text: "entrée restaurée"
    }
  ];
  raw.missions.active.push(...Array.from({ length: 30 }, (_, index) => ({
    id: `${injectedId}-${index}`,
    type: "supply",
    poiId: raw.pois[2].id,
    status: "active",
    createdAtMinutes: "jamais",
    expiresAtMinutes: "jamais"
  })));

  const migrated = migrateState(raw);
  assert.equal(validateMigratedState(migrated), true);
  assert.equal(migrated.pois[0].danger, 5);
  assert.equal(new Set(migrated.pois.map((poi) => poi.id)).size, migrated.pois.length);
  assert.ok(migrated.pois.every((poi) => SAFE_ID.test(poi.id)));
  assert.equal(
    new Set(migrated.base.roster.map((survivor) => survivor.id)).size,
    migrated.base.roster.length
  );
  assert.ok(migrated.base.roster.every((survivor) => SAFE_ID.test(survivor.id)));
  assert.equal(migrated.logs.length, 1);
  assert.equal(migrated.logs[0].category, "system");
  assert.ok(migrated.missions.active.length <= 5);
  assert.ok(migrated.missions.active.every((mission) =>
    Number.isFinite(mission.createdAtMinutes) &&
    Number.isFinite(mission.expiresAtMinutes)
  ));
});

test("réconcilie modules collectés, défenses dérivées et morts transitoires", () => {
  const raw = createInitialState({ start: START, seed: 91 });
  const signalPois = raw.pois.filter((poi) => poi.campaignSignalPart);
  for (const poi of signalPois) {
    poi.looted = true;
    poi.signalPartCollected = true;
  }
  delete raw.campaign;
  raw.base.structures.wall = 3;
  raw.base.wallMaxHealth = 0;
  raw.base.structures.infirmary = 3;
  raw.player.maxHealth = 100;
  raw.base.structures.workshop = 3;
  raw.player.armor = 0;
  raw.zombies.push({
    id: "dead-import",
    type: "alpha",
    pos: START,
    health: 0,
    maxHealth: 430,
    dead: true
  });

  const migrated = migrateState(raw);
  assert.equal(migrated.campaign.signalParts, 3);
  assert.equal(migrated.base.wallMaxHealth, 690);
  assert.equal(migrated.player.maxHealth, 118);
  assert.equal(migrated.player.armor, 18);
  assert.equal(migrated.zombies.some((zombie) => zombie.id === "dead-import"), false);
});

test("une vague vide au rechargement est résolue une seule fois par le moteur", () => {
  const raw = createInitialState({ start: START, seed: 111 });
  raw.wave = {
    active: true,
    number: 2,
    queued: 0,
    total: 1,
    spawned: 1,
    defeated: 1,
    nextSpawnIn: 0,
    announcedDay: 2,
    bossQueued: 0,
    final: false
  };
  raw.zombies = [{
    id: "dead-wave",
    type: "walker",
    pos: START,
    health: 0,
    maxHealth: 44,
    dead: true,
    wave: true
  }];
  const migrated = migrateState(raw);
  const scoreBefore = migrated.score;
  const engine = new GameEngine(migrated);
  engine.step(0.1);
  assert.equal(migrated.wave.active, false);
  assert.ok(migrated.score > scoreBefore);
  const scoreAfter = migrated.score;
  engine.step(0.1);
  assert.equal(migrated.score, scoreAfter);
});

test("ne persiste aucun contenu descriptif Google Places", () => {
  const raw = createInitialState({ start: START, seed: 121 });
  Object.assign(raw.pois[0], {
    source: "google-places",
    realPlace: true,
    placeId: "ChIJ-test-place",
    externalId: "ChIJ-test-place",
    displayName: "Nom Google interdit au stockage",
    name: "Nom Google interdit au stockage",
    address: "Adresse Google interdite",
    formattedAddress: "Adresse Google interdite",
    primaryType: "pharmacy",
    googleTypes: ["pharmacy"],
    googleMapsURI: "https://maps.google.test/place",
    googleFetchedAt: Date.now(),
    googleExpiresAt: Date.now() + 86_400_000
  });
  const stored = sanitizeForStorage(raw);
  const serialized = JSON.stringify(stored);

  assert.equal(stored.pois[0].realPlace, true);
  assert.equal(stored.pois[0].placeId, "ChIJ-test-place");
  assert.doesNotMatch(serialized, /Nom Google|Adresse Google|googleTypes|googleMapsURI|externalId/);
});

test("convertit en objectif procédural une coordonnée Places expirée", () => {
  const raw = createInitialState({ start: START, seed: 131 });
  const oldPos = { ...raw.pois[0].pos };
  Object.assign(raw.pois[0], {
    source: "google-places",
    realPlace: true,
    placeId: "ChIJ-expired",
    googleFetchedAt: Date.now() - 31 * 86_400_000,
    googleExpiresAt: Date.now() - 86_400_000
  });

  const migrated = migrateState(raw);
  assert.equal(migrated.pois[0].realPlace, false);
  assert.equal(migrated.pois[0].source, "procedural-recovery");
  assert.notDeepEqual(migrated.pois[0].pos, oldPos);
});

test("la mission fourgon ne fait jamais dépasser le plafond de missions actives", () => {
  const raw = createInitialState({ start: START, seed: 81 });
  raw.vehicle.discovered = false;
  raw.missions.active = raw.pois.slice(0, 5).map((poi, index) => {
    poi.looted = false;
    poi.missionMarker = "supply";
    return {
      id: `mission-cap-${index}`,
      type: "supply",
      title: `Réserve ${index}`,
      description: "Transmission valide",
      poiId: poi.id,
      status: "active",
      createdAtMinutes: raw.totalMinutes,
      expiresAtMinutes: raw.totalMinutes + 1_000
    };
  });

  const migrated = migrateState(raw);
  assert.equal(validateMigratedState(migrated), true);
  assert.equal(migrated.missions.active.length, 5);
  assert.ok(migrated.pois.some((poi) => poi.vehicleWreck && poi.discovered));
});
