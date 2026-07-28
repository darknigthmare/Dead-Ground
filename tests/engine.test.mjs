import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/engine.js";
import { distanceMeters, destinationPoint } from "../src/geo.js";
import { createInitialState } from "../src/world.js";

const START = { lat: 43.2965, lng: 5.3698 };

function createEngine(difficultyId = "normal") {
  const state = createInitialState({ start: START, difficultyId, seed: 123456 });
  state.tutorialVisible = false;
  return { state, engine: new GameEngine(state) };
}

function createAllHousePois(count = 22) {
  return Array.from({ length: count }, (_, index) => ({
    id: `real-house-${index + 1}`,
    type: "house",
    name: `Maison réelle ${index + 1}`,
    pos: destinationPoint(
      START,
      (index / count) * Math.PI * 2,
      280 + (index % 4) * 210
    ),
    danger: 1,
    currentThreat: 1,
    lootSeed: index + 1,
    source: "google-places",
    realPlace: true
  }));
}

test("crée une partie avec une base, des ressources et des lieux", () => {
  const { state } = createEngine();
  assert.equal(state.status, "playing");
  assert.equal(state.base.health, state.base.maxHealth);
  assert.ok(state.resources.ammo > 0);
  assert.ok(state.pois.length >= 19);
  assert.deepEqual(state.player.pos, START);
});

test("déplace le survivant vers un point cartographique", () => {
  const { state, engine } = createEngine();
  const target = destinationPoint(START, Math.PI / 2, 80);
  const before = distanceMeters(state.player.pos, target);
  assert.equal(engine.moveTo(target), true);
  for (let index = 0; index < 20; index += 1) engine.step(0.25);
  const after = distanceMeters(state.player.pos, target);
  assert.ok(after < before - 15, `distance restante ${after} m`);
  assert.ok(state.distanceTravelled > 15);
});

test("construit une palissade et déduit son coût", () => {
  const { state, engine } = createEngine();
  const woodBefore = state.resources.wood;
  const metalBefore = state.resources.metal;
  assert.equal(engine.buildStructure("wall"), true);
  assert.equal(state.base.structures.wall, 1);
  assert.ok(state.base.wallMaxHealth > 0);
  assert.equal(state.resources.wood, woodBefore - 20);
  assert.equal(state.resources.metal, metalBefore - 6);
});

test("le tir consomme une munition et élimine une cible fragile", () => {
  const { state, engine } = createEngine();
  const target = {
    id: "test-zombie",
    type: "walker",
    pos: destinationPoint(START, 0, 12),
    health: 5,
    maxHealth: 44,
    attackCooldown: 0,
    screamCooldown: 10,
    target: null,
    heading: 0,
    wave: false,
    stagger: 0,
    dead: false
  };
  state.zombies.push(target);
  const ammoBefore = state.resources.ammo;
  assert.equal(engine.fire(), true);
  assert.equal(state.resources.ammo, ammoBefore - 1);
  assert.equal(target.dead, true);
  assert.equal(state.kills, 1);
});

test("fouille un lieu, marque le lieu comme vidé et attribue du butin", () => {
  const { state, engine } = createEngine();
  const poi = state.pois[0];
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  engine.selectPoi(poi.id);
  const resourcesBefore = Object.values(state.resources).reduce((sum, value) => sum + value, 0);
  assert.equal(engine.beginScavenge(), true);
  for (let index = 0; index < 45; index += 1) engine.step(0.25);
  const resourcesAfter = Object.values(state.resources).reduce((sum, value) => sum + value, 0);
  assert.equal(poi.looted, true);
  assert.equal(state.locationsLooted, 1);
  assert.ok(resourcesAfter > resourcesBefore);
});

test("déclenche la vague nocturne au passage de 20 h", () => {
  const { state, engine } = createEngine();
  state.totalMinutes = 1199.5;
  engine.step(0.25);
  assert.equal(state.wave.active, true);
  assert.equal(state.wave.number, 1);
  assert.ok(state.wave.queued > 0 || state.wave.spawned > 0);
});

test("une vague active n’est jamais remplacée au passage de 20 h suivant", () => {
  const { state, engine } = createEngine();
  engine.startNightWave(1);
  assert.equal(state.wave.number, 1);
  state.totalMinutes = 1440 + 1199.5;
  engine.step(0.25);
  assert.equal(state.wave.active, true);
  assert.equal(state.wave.number, 1);
  assert.equal(state.wave.announcedDay, 1);
});

test("la récupération de vague renouvelle toutes les ressources critiques, même sur seed 1 et un monde de maisons", () => {
  const procedural = createInitialState({ start: START, difficultyId: "normal", seed: 1 });
  const allHouses = createInitialState({
    start: START,
    difficultyId: "normal",
    seed: 1,
    realPois: createAllHousePois()
  });
  assert.equal(allHouses.pois.every((poi) => poi.type === "house"), true);

  for (const state of [procedural, allHouses]) {
    const engine = new GameEngine(state);
    for (const resource of ["ammo", "parts", "metal", "fuel", "intel"]) {
      state.resources[resource] = 0;
    }
    engine.startNightWave(1);
    engine.completeWave();
    const firstRecovery = Object.fromEntries(
      ["ammo", "parts", "metal", "fuel", "intel"].map((resource) => [resource, state.resources[resource]])
    );
    for (const amount of Object.values(firstRecovery)) assert.ok(amount > 0);

    engine.startNightWave(2);
    engine.completeWave();
    for (const [resource, amount] of Object.entries(firstRecovery)) {
      assert.ok(state.resources[resource] > amount, `${resource} doit être récupérable après chaque vague`);
    }
  }
});

test("termine la partie lorsque la base tombe", () => {
  const state = createInitialState({ start: START, difficultyId: "normal", seed: 123456 });
  let autosaves = 0;
  const engine = new GameEngine(state, {
    onAutosave() {
      autosaves += 1;
    }
  });
  state.base.health = 0;
  engine.step(0.1);
  assert.equal(state.status, "gameover");
  assert.equal(state.paused, true);
  assert.equal(autosaves, 1, "l’état terminal doit être sauvegardé immédiatement");
});

test("sauvegarde immédiatement la victoire de campagne", () => {
  const state = createInitialState({ start: START, difficultyId: "normal", seed: 123456 });
  let autosaves = 0;
  const engine = new GameEngine(state, {
    onAutosave() {
      autosaves += 1;
    }
  });
  state.wave.active = true;
  state.wave.final = true;
  engine.completeWave();
  assert.equal(state.status, "victory");
  assert.equal(autosaves, 1);
});

test("la pause bloque les commandes qui modifieraient encore la simulation", () => {
  const state = createInitialState({ start: START, difficultyId: "normal", seed: 99 });
  const engine = new GameEngine(state);
  const autoBefore = state.autoFire;
  const modeBefore = state.movementMode;
  engine.pause(true);
  assert.equal(engine.toggleAutoFire(), false);
  assert.equal(engine.setMovementMode("sprint"), false);
  assert.equal(state.autoFire, autoBefore);
  assert.equal(state.movementMode, modeBefore);
});
